from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user
from app.models import (
    AnalyticsEvent,
    BankOffer,
    Coupon,
    PriceHistory,
    Product,
    ProductListing,
    ProductSpecification,
    ProductVariant,
    Retailer,
    ReturnPolicy,
    User,
    WarrantyRecord,
)
from app.services.intelligence import (
    buy_or_wait,
    compute_deal_score,
    fake_discount_analysis,
    product_alternatives,
)
from app.services.matching import search_catalog
from app.services.pricing import bank_offer_discount, bank_offer_eligible, best_coupon, effective_price
from app.services.serializers import (
    bank_offer_payload,
    basic_listing_payload,
    coupon_payload,
    history_stats,
    money,
    product_payload,
    retailer_payload,
    variant_payload,
)

router = APIRouter(tags=["Products, prices and intelligence"])


def _product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def _listing_or_404(db: Session, listing_id: int) -> ProductListing:
    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def _event(db: Session, user: User | None, event_type: str, **kwargs) -> None:
    db.add(AnalyticsEvent(user_id=user.id if user else None, event_type=event_type, **kwargs))


@router.get("/api/products")
def list_products(
    q: str = "",
    category: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    retailer: str | None = None,
    min_rating: Decimal | None = Query(default=None, ge=0, le=5),
    availability: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return search_catalog(
        db,
        query=q,
        category=category,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        retailer_slug=retailer,
        min_rating=min_rating,
        availability=availability,
        limit=limit,
        offset=offset,
    )


@router.get("/api/products/search")
def search_products(
    q: str = Query(default="", max_length=200),
    category: str | None = None,
    brand: str | None = None,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    retailer: str | None = None,
    min_rating: Decimal | None = Query(default=None, ge=0, le=5),
    availability: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    result = search_catalog(
        db,
        query=q,
        category=category,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        retailer_slug=retailer,
        min_rating=min_rating,
        availability=availability,
        limit=limit,
        offset=offset,
    )
    _event(db, user, "search", meta={"query": q, "result_count": result["total"], "filters": {"category": category, "brand": brand}})
    db.commit()
    return result


@router.get("/api/products/categories")
def categories(db: Session = Depends(get_db)):
    products = db.scalars(select(Product)).all()
    counts: dict[str, int] = {}
    for product in products:
        counts[product.category] = counts.get(product.category, 0) + 1
    return {"items": [{"name": name, "count": count} for name, count in sorted(counts.items())]}


@router.get("/api/products/slug/{slug}")
def product_detail_by_slug(
    slug: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_detail(product.id, db=db, user=user)


@router.get("/api/deals")
def today_deals(
    limit: int = Query(default=12, ge=1, le=30),
    category: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(ProductListing).join(Product, Product.id == ProductListing.product_id)
    if category:
        query = query.where(Product.category == category)
    listings = db.scalars(query).all()
    ranked = []
    for listing in listings:
        stats = history_stats(listing.id, db)
        effective = effective_price(db, listing)
        average = stats["average"]
        drop = 0.0
        if average:
            drop = round((average - effective["effective_price"]) / average * 100, 2)
        ranked.append(
            {
                "listing": basic_listing_payload(listing, db),
                "product": {
                    "id": listing.product.id,
                    "slug": listing.product.slug,
                    "name": listing.product.name,
                    "brand": listing.product.brand,
                    "category": listing.product.category,
                    "variants": [variant_payload(v) for v in listing.product.variants],
                },
                "effective": effective,
                "history_average": average,
                "history_min": stats["min"],
                "drop_from_average_pct": drop,
                "is_demo": listing.is_demo,
            }
        )
    ranked.sort(key=lambda item: item["drop_from_average_pct"], reverse=True)
    top = ranked[:limit]
    for item in top:
        listing_id = item["listing"]["id"]
        score = compute_deal_score(db, db.get(ProductListing, listing_id))
        item["deal_score"] = {"score": score["score"], "grade": score["grade"], "confidence": score["confidence"]}
    return {
        "items": top,
        "total": len(ranked),
        "methodology": "Ranked by discount against the tracked one-year average effective price. Promotions never influence ranking.",
        "is_demo": True,
    }


@router.get("/api/products/{product_id}")
def product_detail(
    product_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    product = _product_or_404(db, product_id)
    listings = db.scalars(
        select(ProductListing).where(ProductListing.product_id == product.id)
    ).all()
    specs = db.scalars(
        select(ProductSpecification).where(ProductSpecification.product_id == product.id)
    ).all()
    coupons = db.scalars(select(Coupon).where(Coupon.product_id == product.id, Coupon.is_verified.is_(True))).all()
    payload = product_payload(product)
    payload.update(
        {
            "listings": [basic_listing_payload(listing, db) for listing in listings],
            "specifications": [
                {
                    "group": spec.spec_group,
                    "name": spec.name,
                    "value": spec.value,
                    "source": spec.source,
                    "verified_at": spec.verified_at.isoformat(),
                    "is_demo": spec.is_demo,
                }
                for spec in specs
            ],
            "product_coupons": [coupon_payload(coupon) for coupon in coupons],
            "price_range": {
                "min": money(min((listing.price for listing in listings), default=Decimal("0"))),
                "max": money(max((listing.price for listing in listings), default=Decimal("0"))),
            },
            "alternatives": product_alternatives(db, product, limit=3),
        }
    )
    _event(db, user, "product_view", product_id=product.id)
    db.commit()
    return payload


@router.get("/api/comparison")
def comparison(
    product_id: int,
    variant_id: int | None = None,
    session_id: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    product = _product_or_404(db, product_id)
    variants = list(product.variants)
    if not variants:
        raise HTTPException(status_code=404, detail="Product has no variants")
    if variant_id is None:
        variant_id = max(
            variants,
            key=lambda variant: len(
                [listing for listing in product.listings if listing.variant_id == variant.id]
            ),
        ).id
    variant = db.get(ProductVariant, variant_id)
    if variant is None or variant.product_id != product.id:
        raise HTTPException(status_code=400, detail="Variant does not belong to this product")

    listings = db.scalars(
        select(ProductListing)
        .where(ProductListing.product_id == product.id, ProductListing.variant_id == variant.id)
        .order_by(ProductListing.price.asc())
    ).all()
    if not listings:
        raise HTTPException(status_code=404, detail="No listings for this exact variant")

    enriched = []
    for listing in listings:
        basic = basic_listing_payload(listing, db)
        effective = effective_price(db, listing)
        bank_options = []
        offers = db.scalars(select(BankOffer).where(BankOffer.is_active.is_(True))).all()
        for offer in offers:
            eligible, reason = bank_offer_eligible(offer, listing.price + listing.delivery_charge, "credit", listing.retailer_id)
            if eligible:
                value = bank_offer_discount(offer, listing.price + listing.delivery_charge)
                bank_options.append(
                    {
                        **bank_offer_payload(offer),
                        "eligible": True,
                        "eligibility_note": reason,
                        "estimated_discount": money(value),
                        "payable_if_selected": money(Decimal(str(effective["effective_price"])) - value),
                        "cashback_note": "Cashback is not deducted from immediate payable amount" if offer.is_cashback else None,
                    }
                )
        bank_options.sort(key=lambda item: item["payable_if_selected"])
        coupons = db.scalars(
            select(Coupon).where(Coupon.retailer_id == listing.retailer_id, Coupon.is_verified.is_(True))
        ).all()
        enriched.append(
            {
                **basic,
                "effective": effective,
                "coupons": [coupon_payload(coupon) for coupon in coupons if coupon.product_id in (None, product.id)],
                "bank_offers": bank_options,
                "is_cheapest_effective": False,
                "exact_variant": True,
            }
        )
    enriched.sort(key=lambda item: item["effective"]["effective_price"])
    enriched[0]["is_cheapest_effective"] = True
    cheapest = enriched[0]

    comparison_session = session_id or uuid.uuid4().hex
    _event(
        db,
        user,
        "comparison",
        product_id=product.id,
        listing_id=cheapest["id"],
        meta={
            "session_id": comparison_session,
            "variant_id": variant.id,
            "listing_ids": [item["id"] for item in enriched],
            "cheapest_listing_id": cheapest["id"],
            "savings_identified": round(enriched[-1]["effective"]["effective_price"] - cheapest["effective"]["effective_price"], 2),
        },
    )
    db.commit()

    return {
        "product": {
            "id": product.id,
            "slug": product.slug,
            "name": product.name,
            "brand": product.brand,
            "model": product.model,
            "category": product.category,
            "is_demo": product.is_demo,
        },
        "variant": variant_payload(variant),
        "variants": [variant_payload(item) for item in variants],
        "listings": enriched,
        "lowest_verified_effective_price": cheapest["effective"]["effective_price"],
        "cheapest_listing_id": cheapest["id"],
        "comparison_session_id": comparison_session,
        "verified_timestamp": cheapest["verified_at"],
        "data_sources": sorted({item["source"] for item in enriched}),
        "disclaimer": "Only the same exact variant is compared. All seeded listings are demo records; verify availability and final price on the retailer site.",
    }


@router.get("/api/products/{product_id}/alternatives")
def alternatives(product_id: int, db: Session = Depends(get_db)):
    return product_alternatives(db, _product_or_404(db, product_id))


def _history_response(db: Session, listing_id: int, days: int) -> dict:
    listing = _listing_or_404(db, listing_id)
    rows = db.scalars(
        select(PriceHistory)
        .where(PriceHistory.listing_id == listing_id)
        .order_by(PriceHistory.recorded_at.asc())
    ).all()
    cutoff = datetime.now(timezone.utc).timestamp() - days * 86400
    selected = [row for row in rows if row.recorded_at.timestamp() >= cutoff]
    if not selected:
        selected = rows[-days:] if rows else []
    values = [row.price for row in selected]
    full_stats = history_stats(listing_id, db)
    return {
        "listing_id": listing_id,
        "days_requested": days,
        "product_id": listing.product_id,
        "variant_id": listing.variant_id,
        "retailer_id": listing.retailer_id,
        "points": [
            {"date": row.recorded_at.date().isoformat(), "price": money(row.price), "mrp": money(row.mrp), "is_demo": row.is_demo}
            for row in selected
        ],
        "min": money(min(values)) if values else None,
        "max": money(max(values)) if values else None,
        "average": money(sum(values) / len(values)) if values else None,
        "latest": money(selected[-1].price) if selected else None,
        "historical_min_all_time": full_stats["min"],
        "historical_max_all_time": full_stats["max"],
        "average_all_time": full_stats["average"],
        "days_covered": (selected[-1].recorded_at - selected[0].recorded_at).days if len(selected) > 1 else 0,
        "completeness": full_stats["completeness"],
        "data_completeness_note": "Daily demo history generated for testing. Production history must come from authorised retailer feeds.",
        "is_demo": all(row.is_demo for row in selected) if selected else True,
        "last_verified_at": listing.verified_at.isoformat(),
        "source": listing.source,
        "disclaimer": "Do not treat demo historical prices as evidence of a retailer's past pricing.",
    }


@router.get("/api/prices/history")
@router.get("/api/price-history")
def price_history(
    listing_id: int,
    days: int = Query(default=90, ge=7, le=730),
    db: Session = Depends(get_db),
):
    return _history_response(db, listing_id, days)


@router.get("/api/prices/current")
def current_price(listing_id: int, db: Session = Depends(get_db)):
    listing = _listing_or_404(db, listing_id)
    return {
        "listing": basic_listing_payload(listing, db),
        "effective": effective_price(db, listing),
        "last_verified_at": listing.verified_at.isoformat(),
        "is_demo": listing.is_demo,
    }


@router.get("/api/deal-score")
def deal_score(listing_id: int, db: Session = Depends(get_db)):
    return compute_deal_score(db, _listing_or_404(db, listing_id))


@router.get("/api/fake-discount")
def fake_discount(listing_id: int, db: Session = Depends(get_db)):
    return fake_discount_analysis(db, _listing_or_404(db, listing_id))


@router.get("/api/buy-or-wait")
def buy_wait(listing_id: int, db: Session = Depends(get_db)):
    return buy_or_wait(db, _listing_or_404(db, listing_id))


@router.get("/api/warranty/compare")
def warranty_compare(product_id: int, db: Session = Depends(get_db)):
    product = _product_or_404(db, product_id)
    listings = db.scalars(select(ProductListing).where(ProductListing.product_id == product.id)).all()
    retailer_ids = {listing.retailer_id for listing in listings}
    retail_policies = db.scalars(
        select(ReturnPolicy).where(ReturnPolicy.retailer_id.in_(retailer_ids))
    ).all()
    warranties = db.scalars(select(WarrantyRecord).where(WarrantyRecord.product_id == product.id)).all()
    retailers = {retailer.id: retailer for retailer in db.scalars(select(Retailer)).all()}
    return {
        "product_id": product.id,
        "product_name": product.name,
        "return_policies": [
            {
                "retailer": retailer_payload(retailers[policy.retailer_id]),
                "return_days": policy.return_days,
                "replacement_allowed": policy.replacement_allowed,
                "refund_policy": policy.refund_policy,
                "conditions": policy.conditions,
                "source_url": policy.source_url,
                "verified_at": policy.verified_at.isoformat(),
                "is_demo": policy.is_demo,
            }
            for policy in retail_policies
            if policy.retailer_id in retailers
        ],
        "warranty_records": [
            {
                "id": record.id,
                "retailer_id": record.retailer_id,
                "warranty_months": record.warranty_months,
                "provider": record.provider,
                "coverage": record.coverage,
                "source_url": record.source_url,
                "verified_at": record.verified_at.isoformat(),
                "is_demo": record.is_demo,
            }
            for record in warranties
        ],
        "note": "Warranty and return terms are demo records. Always confirm the current policy with the retailer and manufacturer.",
    }

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import BankOffer, Coupon, PriceHistory, ProductListing, Retailer
from app.services.extension import resolve_listing
from app.services.intelligence import buy_or_wait, compute_deal_score, fake_discount_analysis, product_alternatives
from app.services.pricing import bank_offer_discount, bank_offer_eligible, effective_price
from app.services.serializers import (
    bank_offer_payload,
    basic_listing_payload,
    coupon_payload,
    money,
    variant_payload,
)

router = APIRouter(prefix="/api/extension", tags=["Browser extension"])


@router.get("/resolve")
def resolve(
    title: str = Query(min_length=2, max_length=400),
    retailer: str | None = None,
    external_id: str | None = Query(default=None, max_length=160),
    variant_hint: str = Query(default="", max_length=300),
    db: Session = Depends(get_db),
):
    result = resolve_listing(db, title, retailer, external_id, variant_hint)
    if result is None:
        return {
            "matched": False,
            "confidence": 0,
            "message": "No exact tracked variant matched this page. DISCOUNT AI will not compare a different configuration.",
        }
    return result


@router.get("/intelligence")
def intelligence(
    listing_id: int,
    db: Session = Depends(get_db),
):
    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    effective = effective_price(db, listing)
    deal = compute_deal_score(db, listing)
    fake = fake_discount_analysis(db, listing)
    advice = buy_or_wait(db, listing)
    history = db.scalars(
        select(PriceHistory)
        .where(PriceHistory.listing_id == listing.id)
        .order_by(PriceHistory.recorded_at.asc())
    ).all()
    points = [
        {
            "date": row.recorded_at.date().isoformat(),
            "price": money(row.price),
            "mrp": money(row.mrp),
        }
        for row in history
    ]
    siblings = db.scalars(
        select(ProductListing).where(
            ProductListing.product_id == listing.product_id,
            ProductListing.variant_id == listing.variant_id,
        )
    ).all()
    comparison = []
    for item in siblings:
        item_effective = effective_price(db, item)
        comparison.append(
            {
                **basic_listing_payload(item, db),
                "effective": item_effective,
                "is_cheapest_effective": False,
            }
        )
    comparison.sort(key=lambda item: item["effective"]["effective_price"])
    if comparison:
        comparison[0]["is_cheapest_effective"] = True

    coupons = db.scalars(
        select(Coupon).where(
            Coupon.retailer_id == listing.retailer_id,
            Coupon.is_verified.is_(True),
        )
    ).all()
    offers = db.scalars(select(BankOffer).where(BankOffer.is_active.is_(True))).all()
    bank_offers = []
    for offer in offers:
        eligible, reason = bank_offer_eligible(
            offer,
            Decimal(listing.price) + Decimal(listing.delivery_charge),
            "credit",
            listing.retailer_id,
        )
        if eligible:
            bank_offers.append(
                {
                    **bank_offer_payload(offer),
                    "estimated_discount": money(
                        bank_offer_discount(
                            offer,
                            Decimal(listing.price) + Decimal(listing.delivery_charge),
                        )
                    ),
                    "eligibility_note": reason,
                }
            )
    retailer = db.get(Retailer, listing.retailer_id)
    return {
        "listing": basic_listing_payload(listing, db),
        "retailer": {
            "id": retailer.id,
            "slug": retailer.slug,
            "name": retailer.name,
        } if retailer else None,
        "variant": variant_payload(listing.variant),
        "effective": effective,
        "final_price": effective["effective_price"],
        "deal_score": deal,
        "fake_discount": fake,
        "buy_or_wait": advice,
        "price_history": {
            "points": points,
            "days": len({row.recorded_at.date() for row in history}),
            "min": money(min((row.price for row in history), default=Decimal("0"))),
            "max": money(max((row.price for row in history), default=Decimal("0"))),
            "average": money(
                sum((row.price for row in history), Decimal("0")) / len(history)
            ) if history else None,
            "is_demo": all(row.is_demo for row in history) if history else True,
        },
        "comparison": comparison,
        "coupons": [coupon_payload(coupon) for coupon in coupons if coupon.product_id in (None, listing.product_id)],
        "bank_offers": bank_offers,
        "alternatives": product_alternatives(db, listing.product),
        "tracking": {
            "can_create_alert": True,
            "endpoint": "/api/alerts",
            "requires_auth": True,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclosures": [
            "Exact variant only; bank offers depend on issuer eligibility.",
            "Seeded catalogue and price history are demo data.",
        ],
    }

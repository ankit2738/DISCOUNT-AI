from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user
from app.models import BankOffer, Coupon, CouponVerification, MarketplaceListing, Product, ProductListing, Retailer, User
from app.schemas import CouponMatchRequest, CouponVerifyRequest, PriceCalculatorRequest
from app.services.pricing import (
    bank_offer_discount,
    bank_offer_eligible,
    best_coupon,
    calculate_final_price,
    effective_price,
)
from app.services.serializers import (
    bank_offer_payload,
    coupon_payload,
    money,
    retailer_payload,
)

router = APIRouter(tags=["Coupons, bank offers and final price"])


@router.get("/api/coupons")
def list_coupons(
    retailer_id: int | None = None,
    product_id: int | None = None,
    verified_only: bool = False,
    include_expired: bool = False,
    q: str = "",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(Coupon)
    if retailer_id is not None:
        query = query.where(Coupon.retailer_id == retailer_id)
    if product_id is not None:
        query = query.where((Coupon.product_id == product_id) | (Coupon.product_id.is_(None)))
    if verified_only:
        query = query.where(Coupon.is_verified.is_(True))
    if q:
        query = query.where(Coupon.code.ilike(f"%{q}%") | Coupon.title.ilike(f"%{q}%"))
    coupons = db.scalars(query.order_by(Coupon.is_verified.desc(), Coupon.expires_at.asc())).all()
    now = datetime.now(timezone.utc)
    retailers = {retailer.id: retailer for retailer in db.scalars(select(Retailer)).all()}
    items = []
    for coupon in coupons:
        expires = coupon.expires_at
        expired = bool(expires and (expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)) < now)
        if expired and not include_expired:
            continue
        payload = coupon_payload(coupon)
        payload.update(
            {
                "expired": expired,
                "retailer": retailer_payload(retailers[coupon.retailer_id]) if coupon.retailer_id in retailers else None,
            }
        )
        items.append(payload)
    return {"items": items[offset : offset + limit], "total": len(items), "limit": limit, "offset": offset}


@router.get("/api/coupons/{coupon_id}")
def get_coupon(coupon_id: int, db: Session = Depends(get_db)):
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    retailer = db.get(Retailer, coupon.retailer_id)
    return {**coupon_payload(coupon), "retailer": retailer_payload(retailer) if retailer else None}


@router.post("/api/coupons/{coupon_id}/verify")
def verify_coupon(
    coupon_id: int,
    payload: CouponVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    verification = CouponVerification(
        coupon_id=coupon.id,
        user_id=user.id,
        status=payload.status,
        evidence_url=payload.evidence_url,
        notes=payload.notes,
    )
    db.add(verification)
    db.commit()
    db.refresh(verification)
    return {
        "id": verification.id,
        "coupon_id": coupon.id,
        "status": verification.status,
        "verified_at": verification.verified_at.isoformat(),
        "note": "Community verification recorded. It is not displayed as retailer-verified until an admin reviews it.",
        "is_coupon_officially_verified": coupon.is_verified,
    }


@router.get("/api/bank-offers")
def list_bank_offers(
    bank: str | None = None,
    retailer_id: int | None = None,
    card_type: str | None = None,
    include_inactive: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = select(BankOffer)
    if bank:
        query = query.where(BankOffer.bank_name.ilike(f"%{bank}%"))
    if retailer_id is not None:
        query = query.where((BankOffer.retailer_id == retailer_id) | (BankOffer.retailer_id.is_(None)))
    if card_type:
        query = query.where((BankOffer.card_type == card_type) | (BankOffer.card_type == "any"))
    if not include_inactive:
        query = query.where(BankOffer.is_active.is_(True))
    offers = db.scalars(query.order_by(BankOffer.bank_name.asc())).all()
    return {"items": [bank_offer_payload(offer) for offer in offers[:limit]], "total": len(offers)}


@router.post("/api/price-calculator")
def price_calculator(payload: PriceCalculatorRequest, db: Session = Depends(get_db)):
    return calculate_final_price(db, payload)


@router.get("/api/price-calculator")
def price_calculator_get(
    price: float = Query(gt=0),
    delivery_charge: float = Query(default=0, ge=0),
    platform_discount: float = Query(default=0, ge=0),
    coupon_code: str | None = None,
    bank_offer_id: int | None = None,
    card_type: str = "credit",
    retailer_id: int | None = None,
    quantity: int = Query(default=1, ge=1, le=20),
    db: Session = Depends(get_db),
):
    payload = PriceCalculatorRequest(
        price=price,
        delivery_charge=delivery_charge,
        platform_discount=platform_discount,
        coupon_code=coupon_code,
        bank_offer_id=bank_offer_id,
        card_type=card_type,
        retailer_id=retailer_id,
        quantity=quantity,
    )
    return calculate_final_price(db, payload)


@router.get("/api/offers")
def offers_for_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    coupons = db.scalars(
        select(Coupon).where(
            Coupon.retailer_id == listing.retailer_id,
            Coupon.is_verified.is_(True),
        )
    ).all()
    coupon, discount = best_coupon(db, listing, listing.price)
    eligible_coupons = []
    for item in coupons:
        if item.product_id not in (None, listing.product_id):
            continue
        eligible_coupons.append(coupon_payload(item))
    bank_offers = db.scalars(select(BankOffer).where(BankOffer.is_active.is_(True))).all()
    bank_options = []
    for offer in bank_offers:
        eligible, reason = bank_offer_eligible(offer, listing.price + listing.delivery_charge, "credit", listing.retailer_id)
        if not eligible:
            continue
        value = bank_offer_discount(offer, listing.price + listing.delivery_charge)
        bank_options.append({**bank_offer_payload(offer), "estimated_discount": money(value), "eligibility_note": reason})
    bank_options.sort(key=lambda item: item["estimated_discount"], reverse=True)
    return {
        "listing_id": listing.id,
        "best_coupon": coupon_payload(coupon) if coupon else None,
        "coupon_discount": money(discount),
        "coupons": eligible_coupons,
        "bank_offers": bank_options,
        "effective": effective_price(db, listing),
        "disclaimer": "Offer data is demo/community-sourced unless marked verified. Confirm eligibility at checkout.",
    }


def _marketplace_coupon_options(
    db: Session,
    amount,
    retailer_id: int | None,
    product: Product | None,
) -> list[dict]:
    from datetime import datetime, timezone
    from decimal import Decimal

    query = select(MarketplaceListing).where(
        MarketplaceListing.status == "approved",
        MarketplaceListing.is_transfer_allowed.is_(True),
        MarketplaceListing.usage_status == "unused",
    )
    if retailer_id is not None:
        query = query.where(MarketplaceListing.retailer_id == retailer_id)
    now = datetime.now(timezone.utc)
    options: list[dict] = []
    for listing in db.scalars(query).all():
        expires = listing.expires_at
        if expires is not None:
            expires = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
            if expires < now:
                continue
        if Decimal(listing.min_order or 0) > Decimal(amount):
            continue
        applicable = [item.strip().lower() for item in (listing.applicable_products or "").split("|") if item.strip()]
        if applicable and product is not None:
            haystack = f"{product.name} {product.brand or ''} {product.slug}".lower()
            if not any(token in haystack for token in applicable):
                continue
        value = min(Decimal(listing.coupon_value or 0), Decimal(amount))
        net_saving = (value - Decimal(listing.price)).quantize(Decimal("0.01"))
        options.append(
            {
                "listing_id": listing.id,
                "title": listing.title,
                "price": money(listing.price),
                "coupon_value": money(listing.coupon_value),
                "net_saving": money(net_saving),
                "min_order": money(listing.min_order),
                "expires_at": listing.expires_at.isoformat() if listing.expires_at else None,
                "seller_id": listing.seller_id,
                "redeemable_after_purchase": True,
            }
        )
    options.sort(key=lambda item: float(item["net_saving"]), reverse=True)
    return options


@router.post("/api/coupons/match")
def match_coupons(payload: CouponMatchRequest, db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    from decimal import Decimal
    from app.services.pricing import coupon_discount, coupon_eligible

    now = datetime.now(timezone.utc)
    results = []
    for item in payload.items:
        product_listing = db.get(ProductListing, item.listing_id) if item.listing_id else None
        product = db.get(Product, item.product_id or (product_listing.product_id if product_listing else 0))
        retailer_id = item.retailer_id or (product_listing.retailer_id if product_listing else None)
        amount = (Decimal(item.amount) * item.quantity).quantize(Decimal("0.01"))
        candidates: list[dict] = []
        coupons = db.scalars(
            select(Coupon).where(Coupon.retailer_id == retailer_id).order_by(Coupon.discount_value.desc())
        ).all() if retailer_id is not None else db.scalars(select(Coupon)).all()
        for coupon in coupons:
            eligible, reason = coupon_eligible(coupon, amount, retailer_id, product.id if product else None)
            if not eligible:
                continue
            discount = coupon_discount(coupon, amount)
            candidates.append(
                {
                    "source": "platform_coupon",
                    "coupon_id": coupon.id,
                    "title": coupon.title,
                    "code": coupon.code,
                    "discount_value": money(coupon.discount_value),
                    "discount_type": coupon.discount_type,
                    "estimated_discount": money(discount),
                    "net_saving": money(discount),
                    "is_verified": coupon.is_verified,
                    "expires_at": coupon.expires_at.isoformat() if coupon.expires_at else None,
                    "eligibility_note": reason,
                }
            )
        if payload.include_marketplace:
            candidates.extend(
                [{**option, "source": "marketplace_listing", "estimated_discount": option["coupon_value"], "eligibility_note": "Valid while listing remains approved and unused"}
                 for option in _marketplace_coupon_options(db, amount, retailer_id, product)]
            )
        candidates.sort(key=lambda candidate: float(candidate["net_saving"]), reverse=True)
        results.append(
            {
                "listing_id": item.listing_id,
                "product_id": product.id if product else item.product_id,
                "product_name": product.name if product else None,
                "retailer_id": retailer_id,
                "amount": money(amount),
                "best": candidates[0] if candidates else None,
                "candidates": candidates,
                "note": "Recommendations test expiry, minimum order, product eligibility and net savings. Marketplace coupon codes stay hidden until purchase.",
            }
        )
    return {
        "items": results,
        "best_overall": max(
            (item["best"] for item in results if item["best"]),
            key=lambda candidate: float(candidate["net_saving"]),
            default=None,
        ),
        "checked_at": now.isoformat(),
    }


@router.get("/api/better-deal/{listing_id}")
def better_deal(
    listing_id: int,
    bank_offer_id: int | None = None,
    card_type: str = "credit",
    coupon_code: str | None = None,
    db: Session = Depends(get_db),
):
    from decimal import Decimal

    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    product = db.get(Product, listing.product_id)
    request = PriceCalculatorRequest(
        price=listing.price,
        delivery_charge=listing.delivery_charge,
        coupon_code=coupon_code,
        bank_offer_id=bank_offer_id,
        card_type=card_type,
        retailer_id=listing.retailer_id,
        quantity=1,
    )
    direct = calculate_final_price(db, request)
    direct_final = Decimal(direct["breakdown"]["final_payable"])
    options = [
        {
            "type": "direct_purchase",
            "label": "Buy at store with eligible direct offers",
            "final_payable": money(direct_final),
            "components": direct["breakdown"],
            "coupon": direct["coupon"],
            "bank_offer": direct["bank_offer"],
            "warnings": direct["warnings"],
            "is_demo": listing.is_demo,
        }
    ]
    for option in _marketplace_coupon_options(db, Decimal(listing.price) + Decimal(listing.delivery_charge), listing.retailer_id, product):
        base = Decimal(listing.price) + Decimal(listing.delivery_charge)
        applied = min(Decimal(option["coupon_value"]), base)
        final_payable = (base - applied + Decimal(option["price"])).quantize(Decimal("0.01"))
        options.append(
            {
                "type": "marketplace_coupon",
                "label": f"Buy coupon from marketplace listing #{option['listing_id']}",
                "listing_id": option["listing_id"],
                "final_payable": money(final_payable),
                "components": {
                    "product_total": money(listing.price),
                    "delivery_charge": money(listing.delivery_charge),
                    "coupon_discount": money(applied),
                    "marketplace_coupon_price": option["price"],
                },
                "warnings": ["Coupon purchase and product purchase are separate transactions; issuer terms must allow stacking and transfer."],
                "is_demo": listing.is_demo,
            }
        )
    options.sort(key=lambda item: float(item["final_payable"]))
    return {
        "listing_id": listing.id,
        "product": {"id": product.id, "name": product.name, "brand": product.brand} if product else None,
        "lowest_valid_final_price": options[0]["final_payable"] if options else None,
        "recommended": options[0] if options else None,
        "options": options,
        "disclaimer": "Only combine offers when their terms allow it. Bank cashback may be delayed and is shown separately by the calculator.",
    }

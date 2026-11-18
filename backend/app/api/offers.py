from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user
from app.models import BankOffer, Coupon, CouponVerification, ProductListing, Retailer, User
from app.schemas import CouponVerifyRequest, PriceCalculatorRequest
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

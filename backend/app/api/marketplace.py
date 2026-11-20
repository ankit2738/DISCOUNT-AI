from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_seller_or_admin
from app.models import (
    Dispute,
    MarketplaceCouponReport,
    MarketplaceListing,
    MarketplaceOrder,
    MarketplaceSeller,
    Notification,
    Retailer,
    SellerReview,
    Transaction,
    User,
)
from app.schemas import (
    CouponReportCreate,
    DisputeCreate,
    DisputeResolution,
    MarketplaceListingCreate,
    MarketplaceListingUpdate,
    MarketplaceOrderCreate,
    SellerApplyRequest,
    SellerReviewCreate,
)
from app.services.audit import record_audit
from app.services.coupon_security import (
    coupon_fingerprint,
    decrypt_coupon_code,
    encrypt_coupon_code,
    masked_code,
)
from app.services.serializers import money

router = APIRouter(prefix="/api/marketplace", tags=["Coupon marketplace"])

FORBIDDEN_PAYMENT_KEYS = {"card", "card_number", "cvv", "cvc", "pan", "expiry", "upi_pin", "pin"}
PLATFORM_FEE_RATE = Decimal("0.05")
NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _fee_split(amount: Decimal) -> tuple[Decimal, Decimal]:
    fee = (amount * PLATFORM_FEE_RATE).quantize(Decimal("0.01"))
    return fee, (amount - fee).quantize(Decimal("0.01"))


def _reputation(seller: MarketplaceSeller) -> dict:
    completed = seller.total_sales
    rating = float(seller.rating or 0)
    dispute_rate = (seller.disputes_lost / completed) if completed else 0.0
    score = 50 + (rating * 8 if seller.review_count else 0) + min(completed, 50) * 0.4 - dispute_rate * 40
    score = max(0.0, min(100.0, score))
    return {
        "score": round(score, 2),
        "rating": money(seller.rating) if seller.review_count else None,
        "review_count": seller.review_count,
        "completed_sales": completed,
        "dispute_count": seller.dispute_count,
        "disputes_lost": seller.disputes_lost,
        "is_verified": seller.is_verified,
        "verification_note": None if seller.review_count or seller.is_verified else "No verified reviews yet; rating is not fabricated.",
    }


def _seller_payload(seller: MarketplaceSeller) -> dict:
    return {
        "id": seller.id,
        "user_id": seller.user_id,
        "display_name": seller.display_name,
        "bio": seller.bio,
        "status": seller.status,
        "rating": money(seller.rating) if seller.review_count else None,
        "total_sales": seller.total_sales,
        "is_verified": seller.is_verified,
        "review_count": seller.review_count,
        "reputation": _reputation(seller),
        "created_at": seller.created_at.isoformat(),
    }


def _listing_payload(listing: MarketplaceListing, db: Session | None = None) -> dict:
    expires = _aware(listing.expires_at)
    expired = bool(expires and expires < NOW())
    discount_pct = None
    if listing.price and listing.coupon_value:
        discount_pct = round(float((listing.coupon_value - listing.price) / listing.coupon_value * 100), 1)
    seller = db.get(MarketplaceSeller, listing.seller_id) if db is not None else None
    retailer = db.get(Retailer, listing.retailer_id) if db is not None and listing.retailer_id else None
    return {
        "id": listing.id,
        "seller_id": listing.seller_id,
        "seller_name": seller.display_name if seller else None,
        "seller_reputation": _reputation(seller)["score"] if seller else None,
        "seller_verified": seller.is_verified if seller else False,
        "title": listing.title,
        "description": listing.description,
        "category": listing.category,
        "price": money(listing.price),
        "coupon_value": money(listing.coupon_value),
        "estimated_saving": money(max(Decimal("0"), Decimal(listing.coupon_value) - Decimal(listing.price))),
        "discount_percent": discount_pct,
        "min_order": money(listing.min_order),
        "brand": listing.brand,
        "retailer_id": listing.retailer_id,
        "retailer_name": retailer.name if retailer else None,
        "applicable_products": [item for item in (listing.applicable_products or "").split("|") if item],
        "usage_restrictions": listing.usage_restrictions,
        "redemption_instructions": listing.redemption_instructions,
        "issuer_terms": listing.issuer_terms,
        "usage_status": listing.usage_status,
        "coupon_code_masked": masked_code(decrypt_coupon_code(listing.coupon_code_encrypted)) if listing.coupon_code_encrypted else None,
        "proof_url": listing.proof_url,
        "expires_at": listing.expires_at.isoformat() if listing.expires_at else None,
        "expired": expired,
        "status": listing.status,
        "is_transfer_allowed": listing.is_transfer_allowed,
        "rejection_reason": listing.rejection_reason,
        "created_at": listing.created_at.isoformat(),
    }


def _order_payload(order: MarketplaceOrder, listing: MarketplaceListing | None = None) -> dict:
    eligible_refund = order.status in {"paid_sandbox", "completed"} and order.redemption_status != "redeemed"
    return {
        "id": order.id,
        "listing_id": order.listing_id,
        "listing_title": listing.title if listing else None,
        "buyer_id": order.buyer_id,
        "seller_id": order.seller_id,
        "amount": money(order.amount),
        "platform_fee": money(order.platform_fee),
        "seller_payout": money(order.seller_payout),
        "status": order.status,
        "payment_provider": order.payment_provider,
        "delivery_details": order.delivery_details,
        "redemption_status": order.redemption_status,
        "code_available": bool(order.coupon_code_encrypted),
        "refund_eligible": eligible_refund,
        "refunded_at": order.refunded_at.isoformat() if order.refunded_at else None,
        "created_at": order.created_at.isoformat(),
    }


def _owned_seller(db: Session, user: User) -> MarketplaceSeller | None:
    return db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))


@router.get("/listings")
def list_marketplace_listings(
    category: str | None = None,
    q: str = "",
    retailer_id: int | None = None,
    brand: str | None = None,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    min_value: Decimal | None = Query(default=None, ge=0),
    sort: str = Query(default="newest", pattern="^(newest|expiry|discount|price)$"),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = select(MarketplaceListing).where(
        MarketplaceListing.status == "approved",
        MarketplaceListing.is_transfer_allowed.is_(True),
    )
    if category:
        query = query.where(MarketplaceListing.category == category)
    if retailer_id is not None:
        query = query.where(MarketplaceListing.retailer_id == retailer_id)
    if brand:
        query = query.where(MarketplaceListing.brand.ilike(f"%{brand}%"))
    if min_price is not None:
        query = query.where(MarketplaceListing.price >= min_price)
    if max_price is not None:
        query = query.where(MarketplaceListing.price <= max_price)
    if min_value is not None:
        query = query.where(MarketplaceListing.coupon_value >= min_value)
    if q:
        query = query.where(
            MarketplaceListing.title.ilike(f"%{q}%")
            | MarketplaceListing.description.ilike(f"%{q}%")
            | MarketplaceListing.brand.ilike(f"%{q}%")
        )
    if sort == "expiry":
        query = query.order_by(MarketplaceListing.expires_at.asc().nulls_last())
    elif sort == "discount":
        query = query.order_by((MarketplaceListing.coupon_value - MarketplaceListing.price).desc())
    elif sort == "price":
        query = query.order_by(MarketplaceListing.price.asc())
    else:
        query = query.order_by(MarketplaceListing.id.desc())
    listings = db.scalars(query.offset(offset).limit(limit)).all()
    items = [_listing_payload(listing, db) for listing in listings]
    return {
        "items": items,
        "total": len(items),
        "note": "Marketplace transactions use a sandbox provider. Coupons may only be resold or transferred where issuer terms permit it. Coupon codes are encrypted and revealed only to the buyer after purchase.",
    }


@router.get("/listings/{listing_id}")
def get_marketplace_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.status != "approved":
        raise HTTPException(status_code=404, detail="Listing not available")
    payload = _listing_payload(listing, db)
    seller = db.get(MarketplaceSeller, listing.seller_id)
    payload["seller"] = _seller_payload(seller) if seller else None
    return payload


@router.post("/seller/apply", status_code=201)
def apply_seller(
    payload: SellerApplyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = _owned_seller(db, user)
    if existing:
        raise HTTPException(status_code=409, detail="Seller profile already exists")
    seller = MarketplaceSeller(
        user_id=user.id,
        display_name=payload.display_name,
        bio=payload.bio,
        status="pending",
        verification_evidence_url=payload.verification_evidence_url,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    return {**_seller_payload(seller), "note": "Seller applications require admin approval before listings go live."}


@router.get("/seller/me")
def seller_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = _owned_seller(db, user)
    if seller is None:
        raise HTTPException(status_code=404, detail="No seller profile. Apply first.")
    listings = db.scalars(
        select(MarketplaceListing).where(MarketplaceListing.seller_id == seller.id).order_by(MarketplaceListing.id.desc())
    ).all()
    orders = db.scalars(select(MarketplaceOrder).where(MarketplaceOrder.seller_id == seller.id)).all()
    completed = [order for order in orders if order.status in {"paid_sandbox", "completed"}]
    refunded = [order for order in orders if order.status == "refunded"]
    earnings = sum((order.seller_payout for order in completed), Decimal("0"))
    gross = sum((order.amount for order in completed), Decimal("0"))
    fees = sum((order.platform_fee for order in completed), Decimal("0"))
    reviews = db.scalars(select(SellerReview).where(SellerReview.seller_id == seller.id).order_by(SellerReview.id.desc())).all()
    reports = db.scalars(
        select(MarketplaceCouponReport)
        .join(MarketplaceListing, MarketplaceListing.id == MarketplaceCouponReport.listing_id)
        .where(MarketplaceListing.seller_id == seller.id)
        .order_by(MarketplaceCouponReport.id.desc())
    ).all()
    return {
        "seller": _seller_payload(seller),
        "listings": [_listing_payload(listing, db) for listing in listings],
        "orders": [_order_payload(order, db.get(MarketplaceListing, order.listing_id)) for order in orders],
        "gross_sales_sandbox": money(gross),
        "platform_fees_sandbox": money(fees),
        "earnings_sandbox": money(earnings),
        "refunded_orders": len(refunded),
        "reviews": [
            {"id": review.id, "order_id": review.order_id, "rating": review.rating, "comment": review.comment, "created_at": review.created_at.isoformat()}
            for review in reviews
        ],
        "reports": [
            {"id": report.id, "listing_id": report.listing_id, "reason": report.reason, "status": report.status}
            for report in reports
        ],
        "note": "Earnings are sandbox records only and exclude a 5% demo platform fee. No live payment settlement occurs.",
    }


@router.patch("/seller/me")
def update_seller_profile(
    payload: SellerApplyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seller = _owned_seller(db, user)
    if seller is None:
        raise HTTPException(status_code=404, detail="No seller profile. Apply first.")
    seller.display_name = payload.display_name
    seller.bio = payload.bio
    if payload.verification_evidence_url is not None:
        seller.verification_evidence_url = payload.verification_evidence_url
    db.commit()
    return _seller_payload(seller)


@router.get("/sellers/{seller_id}")
def public_seller_profile(seller_id: int, db: Session = Depends(get_db)):
    seller = db.get(MarketplaceSeller, seller_id)
    if seller is None:
        raise HTTPException(status_code=404, detail="Seller not found")
    reviews = db.scalars(select(SellerReview).where(SellerReview.seller_id == seller_id).order_by(SellerReview.id.desc()).limit(20)).all()
    listings = db.scalars(
        select(MarketplaceListing).where(
            MarketplaceListing.seller_id == seller_id,
            MarketplaceListing.status == "approved",
            MarketplaceListing.is_transfer_allowed.is_(True),
        )
    ).all()
    return {
        "seller": _seller_payload(seller),
        "reviews": [
            {"id": review.id, "rating": review.rating, "comment": review.comment, "is_verified_purchase": review.is_verified_purchase, "created_at": review.created_at.isoformat()}
            for review in reviews
        ],
        "listings_count": len(listings),
        "note": "Ratings are derived only from verified marketplace orders with buyer reviews.",
    }


@router.post("/listings", status_code=201)
def create_marketplace_listing(
    payload: MarketplaceListingCreate,
    user: User = Depends(require_seller_or_admin),
    db: Session = Depends(get_db),
):
    seller = _owned_seller(db, user)
    if seller is None:
        raise HTTPException(status_code=400, detail="Seller profile required")
    if seller.status != "approved":
        raise HTTPException(status_code=403, detail="Seller profile is not approved")
    if not payload.is_transfer_allowed:
        raise HTTPException(status_code=400, detail="Issuer terms must permit transfer or resale for a listed coupon")
    if payload.expires_at is not None:
        expires = _aware(payload.expires_at)
        if expires is None or expires <= NOW():
            raise HTTPException(status_code=400, detail="Listing expiry must be in the future")
    if payload.retailer_id is not None and db.get(Retailer, payload.retailer_id) is None:
        raise HTTPException(status_code=400, detail="Retailer not found")
    if payload.coupon_code:
        normalized = "".join(payload.coupon_code.split()).upper()
        public_text = " ".join([payload.title, payload.description, payload.issuer_terms, payload.usage_restrictions]).upper()
        if normalized and normalized in public_text.replace(" ", ""):
            raise HTTPException(status_code=400, detail="Do not include the coupon code in public listing fields")
        fingerprint = coupon_fingerprint(payload.coupon_code, payload.retailer_id)
        duplicate = db.scalar(
            select(MarketplaceListing).where(
                MarketplaceListing.coupon_code_hash == fingerprint,
                MarketplaceListing.status.in_(["pending", "approved", "sold"]),
            )
        )
        if duplicate is not None:
            raise HTTPException(status_code=409, detail=f"Duplicate coupon detected (listing #{duplicate.id})")
    else:
        fingerprint = None
    listing = MarketplaceListing(
        seller_id=seller.id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        price=payload.price,
        proof_url=payload.proof_url,
        expires_at=payload.expires_at,
        status="pending",
        is_transfer_allowed=payload.is_transfer_allowed,
        retailer_id=payload.retailer_id,
        brand=payload.brand,
        coupon_code_encrypted=encrypt_coupon_code(payload.coupon_code) if payload.coupon_code else None,
        coupon_code_hash=fingerprint,
        coupon_value=payload.coupon_value,
        min_order=payload.min_order,
        applicable_products="|".join(payload.applicable_products),
        usage_restrictions=payload.usage_restrictions,
        redemption_instructions=payload.redemption_instructions,
        issuer_terms=payload.issuer_terms,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return {**_listing_payload(listing, db), "note": "Listing is pending admin verification. Coupon code is encrypted at rest."}


@router.patch("/listings/{listing_id}")
def update_marketplace_listing(
    listing_id: int,
    payload: MarketplaceListingUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seller = _owned_seller(db, user)
    listing = db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if seller is None or listing.seller_id != seller.id:
        raise HTTPException(status_code=403, detail="You can only edit your own listings")
    if listing.status in {"sold", "withdrawn", "expired"}:
        raise HTTPException(status_code=400, detail="This listing can no longer be edited")
    data = payload.model_dump(exclude_unset=True)
    if "expires_at" in data and data["expires_at"] is not None:
        expires = _aware(data["expires_at"])
        if expires is None or expires <= NOW():
            raise HTTPException(status_code=400, detail="Listing expiry must be in the future")
    if "is_transfer_allowed" in data and not data["is_transfer_allowed"]:
        raise HTTPException(status_code=400, detail="Issuer terms must permit transfer or resale")
    for key, value in data.items():
        setattr(listing, key, value)
    listing.status = "pending"
    listing.rejection_reason = ""
    db.commit()
    return {**_listing_payload(listing, db), "note": "Edited listing requires re-verification."}


@router.post("/listings/{listing_id}/withdraw")
def withdraw_marketplace_listing(
    listing_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    seller = _owned_seller(db, user)
    listing = db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if seller is None or listing.seller_id != seller.id:
        raise HTTPException(status_code=403, detail="You can only withdraw your own listings")
    if listing.status == "sold":
        raise HTTPException(status_code=400, detail="Sold listings cannot be withdrawn")
    listing.status = "withdrawn"
    db.commit()
    return {"id": listing.id, "status": listing.status}


@router.get("/orders")
def list_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = _owned_seller(db, user)
    seller_id = seller.id if seller else -1
    orders = db.scalars(
        select(MarketplaceOrder)
        .where((MarketplaceOrder.buyer_id == user.id) | (MarketplaceOrder.seller_id == seller_id))
        .order_by(MarketplaceOrder.id.desc())
    ).all()
    listing_ids = {order.listing_id for order in orders}
    listings = {
        listing.id: listing
        for listing in db.scalars(select(MarketplaceListing).where(MarketplaceListing.id.in_(listing_ids))).all()
    } if listing_ids else {}
    items = []
    for order in orders:
        payload = _order_payload(order, listings.get(order.listing_id))
        payload["role"] = "buyer" if order.buyer_id == user.id else "seller"
        items.append(payload)
    return {"items": items, "total": len(items)}


@router.get("/wallet")
def purchased_coupon_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.scalars(
        select(MarketplaceOrder).where(MarketplaceOrder.buyer_id == user.id).order_by(MarketplaceOrder.id.desc())
    ).all()
    orders = [order for order in orders if order.status in {"paid_sandbox", "completed", "disputed"}]
    listings = {
        listing.id: listing
        for listing in db.scalars(
            select(MarketplaceListing).where(MarketplaceListing.id.in_({order.listing_id for order in orders}))
        ).all()
    } if orders else {}
    items = []
    now = NOW()
    for order in orders:
        listing = listings.get(order.listing_id)
        if listing is None:
            continue
        code = None
        if order.coupon_code_encrypted and order.status in {"paid_sandbox", "completed", "disputed"}:
            code = decrypt_coupon_code(order.coupon_code_encrypted)
        expires = _aware(listing.expires_at)
        items.append(
            {
                "order_id": order.id,
                "listing_id": listing.id,
                "title": listing.title,
                "retailer_id": listing.retailer_id,
                "coupon_value": money(listing.coupon_value),
                "paid": money(order.amount),
                "saving": money(max(Decimal("0"), Decimal(listing.coupon_value) - Decimal(order.amount))),
                "code": code,
                "masked_code": masked_code(code) if code else None,
                "redemption_instructions": listing.redemption_instructions,
                "usage_restrictions": listing.usage_restrictions,
                "min_order": money(listing.min_order),
                "expires_at": listing.expires_at.isoformat() if listing.expires_at else None,
                "expires_in_days": max(0, (expires - now).days) if expires else None,
                "expiring_soon": bool(expires and (expires - now).days <= 3),
                "redemption_status": order.redemption_status,
                "order_status": order.status,
            }
        )
    return {
        "items": items,
        "total": len(items),
        "note": "Coupon codes are decrypted only for the authorised buyer. Do not share them publicly.",
    }


@router.get("/orders/{order_id}/coupon")
def reveal_purchased_coupon(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.get(MarketplaceOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can reveal this coupon")
    if order.status not in {"paid_sandbox", "completed", "disputed"}:
        raise HTTPException(status_code=400, detail="Coupon is not available for this order status")
    if not order.coupon_code_encrypted:
        raise HTTPException(status_code=404, detail="This listing has no stored coupon code; contact the seller")
    listing = db.get(MarketplaceListing, order.listing_id)
    if order.code_delivered_at is None:
        order.code_delivered_at = NOW()
        record_audit(db, user.id, "marketplace.coupon_reveal", "marketplace_order", order.id)
        db.commit()
    return {
        "order_id": order.id,
        "code": decrypt_coupon_code(order.coupon_code_encrypted),
        "redemption_instructions": listing.redemption_instructions if listing else "",
        "expires_at": listing.expires_at.isoformat() if listing and listing.expires_at else None,
        "note": "This code was revealed through an authorised buyer transaction and the access was audited.",
    }


@router.post("/orders/{order_id}/redeem")
def mark_coupon_redeemed(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.get(MarketplaceOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can confirm redemption")
    if order.status not in {"paid_sandbox", "completed"}:
        raise HTTPException(status_code=400, detail="Order cannot be marked redeemed in its current state")
    if order.redemption_status == "redeemed":
        return {"order_id": order.id, "redemption_status": order.redemption_status}
    order.redemption_status = "redeemed"
    order.redeemed_at = NOW()
    listing = db.get(MarketplaceListing, order.listing_id)
    if listing is not None:
        listing.usage_status = "used"
    record_audit(db, user.id, "marketplace.coupon_redeem", "marketplace_order", order.id)
    db.commit()
    return {"order_id": order.id, "redemption_status": order.redemption_status}




@router.post("/reminders/expiry")
def run_coupon_expiry_reminders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = NOW()
    orders = db.scalars(
        select(MarketplaceOrder).where(
            MarketplaceOrder.buyer_id == user.id,
            MarketplaceOrder.status.in_(["paid_sandbox", "completed"]),
            MarketplaceOrder.redemption_status != "redeemed",
        )
    ).all()
    created = 0
    for order in orders:
        listing = db.get(MarketplaceListing, order.listing_id)
        if listing is None:
            continue
        expires = _aware(listing.expires_at)
        if expires is None:
            continue
        days_left = (expires - now).days
        if days_left > 7 or expires < now:
            continue
        marker = f"order #{order.id}"
        existing = db.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "coupon_expiry_reminder",
                Notification.body.ilike(f"%{marker}%"),
            )
        )
        if existing is not None:
            continue
        db.add(
            Notification(
                user_id=user.id,
                type="coupon_expiry_reminder",
                title="Purchased coupon expiring soon",
                body=f"Your marketplace coupon for {marker} expires in {max(0, days_left)} day(s). Redeem it before {expires.date().isoformat()}.",
                channel="in_app",
                status="in_app",
            )
        )
        created += 1
    db.commit()
    return {"created": created, "note": "In-app reminders use your notification preferences; external channels are only used when configured."}

@router.post("/orders", status_code=201)
def create_order(
    payload: MarketplaceOrderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.idempotency_key:
        existing_order = db.scalar(
            select(MarketplaceOrder).where(
                MarketplaceOrder.buyer_id == user.id,
                MarketplaceOrder.idempotency_key == payload.idempotency_key,
            )
        )
        if existing_order is not None:
            existing_listing = db.get(MarketplaceListing, existing_order.listing_id)
            existing_tx = db.scalar(
                select(Transaction).where(
                    Transaction.order_id == existing_order.id,
                    Transaction.type == "payment",
                )
            )
            return {
                **_order_payload(existing_order, existing_listing),
                "transaction_reference": existing_tx.provider_reference if existing_tx else None,
                "idempotent_replay": True,
            }

    listing = db.scalar(
        select(MarketplaceListing)
        .where(MarketplaceListing.id == payload.listing_id)
        .with_for_update()
    )
    if listing is None or listing.status != "approved":
        raise HTTPException(status_code=404, detail="Approved listing not found")
    seller = db.get(MarketplaceSeller, listing.seller_id)
    if seller is None or seller.status != "approved":
        raise HTTPException(status_code=400, detail="Seller is not approved")
    if seller.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot buy your own listing")
    if not listing.is_transfer_allowed:
        raise HTTPException(status_code=400, detail="Issuer terms do not permit resale or transfer of this listing")
    expires = _aware(listing.expires_at)
    if expires is not None and expires < NOW():
        listing.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Listing has expired")
    if listing.usage_status != "unused":
        raise HTTPException(status_code=400, detail="Coupon is no longer available")
    forbidden = FORBIDDEN_PAYMENT_KEYS.intersection({key.lower() for key in payload.delivery_details})
    if forbidden:
        raise HTTPException(status_code=400, detail="Raw payment credentials are not accepted; use the sandbox provider")

    reference = f"sbx_{secrets.token_hex(8)}"
    fee, payout = _fee_split(Decimal(listing.price))
    order = MarketplaceOrder(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=seller.id,
        amount=listing.price,
        platform_fee=fee,
        seller_payout=payout,
        idempotency_key=payload.idempotency_key,
        status="paid_sandbox",
        payment_provider="sandbox",
        delivery_details=payload.delivery_details,
        coupon_code_encrypted=listing.coupon_code_encrypted,
    )
    db.add(order)
    db.flush()
    db.add(
        Transaction(
            order_id=order.id,
            provider="sandbox",
            provider_reference=reference,
            amount=listing.price,
            currency="INR",
            status="paid_sandbox",
            type="payment",
            meta={"note": "Sandbox transaction; no real money moved.", "platform_fee": str(fee), "seller_payout": str(payout)},
        )
    )
    listing.status = "sold"
    listing.usage_status = "sold"
    seller.total_sales += 1
    record_audit(db, user.id, "marketplace.order_created", "marketplace_order", order.id, after={"listing_id": listing.id, "amount": str(listing.price)})
    db.commit()
    db.refresh(order)
    return {
        **_order_payload(order, listing),
        "transaction_reference": reference,
        "note": "Sandbox payment recorded. No live payment was processed and no raw card data is accepted. The 5% platform fee is a demo calculation. Retrieve the coupon in your wallet.",
    }


@router.post("/orders/{order_id}/refund-request", status_code=201)
def request_refund(
    order_id: int,
    payload: DisputeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.order_id != order_id:
        raise HTTPException(status_code=400, detail="Order id mismatch")
    order = db.get(MarketplaceOrder, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can request a refund")
    if order.redemption_status == "redeemed":
        raise HTTPException(status_code=400, detail="Redeemed coupons are not refund eligible")
    if order.status not in {"paid_sandbox", "completed"}:
        raise HTTPException(status_code=400, detail="This order cannot be disputed in its current state")
    existing = db.scalar(select(Dispute).where(Dispute.order_id == order.id, Dispute.status == "open"))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An open dispute already exists for this order")
    dispute = Dispute(
        order_id=order.id,
        opened_by=user.id,
        reason=payload.reason,
        evidence_url=payload.evidence_url,
        status="open",
    )
    order.status = "disputed"
    seller = db.get(MarketplaceSeller, order.seller_id)
    if seller is not None:
        seller.dispute_count += 1
    db.add(dispute)
    record_audit(db, user.id, "marketplace.refund_requested", "marketplace_order", order.id)
    db.commit()
    db.refresh(dispute)
    return {"id": dispute.id, "order_id": order.id, "status": dispute.status, "created_at": dispute.created_at.isoformat()}


@router.post("/disputes", status_code=201)
def create_dispute(
    payload: DisputeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.get(MarketplaceOrder, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    seller = db.get(MarketplaceSeller, order.seller_id)
    if order.buyer_id != user.id and (seller is None or seller.user_id != user.id):
        raise HTTPException(status_code=403, detail="Only the buyer or seller can open a dispute")
    existing = db.scalar(
        select(Dispute).where(
            Dispute.order_id == order.id,
            Dispute.status == "open",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="An open dispute already exists for this order")
    if order.status not in {"paid_sandbox", "completed"}:
        raise HTTPException(status_code=400, detail="This order cannot be disputed in its current state")
    dispute = Dispute(
        order_id=order.id,
        opened_by=user.id,
        reason=payload.reason,
        evidence_url=payload.evidence_url,
        status="open",
    )
    order.status = "disputed"
    if seller is not None:
        seller.dispute_count += 1
    db.add(dispute)
    db.commit()
    db.refresh(dispute)
    return {"id": dispute.id, "order_id": order.id, "status": dispute.status, "created_at": dispute.created_at.isoformat()}


@router.get("/disputes")
def list_disputes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = _owned_seller(db, user)
    order_ids = [
        order.id
        for order in db.scalars(
            select(MarketplaceOrder).where(
                (MarketplaceOrder.buyer_id == user.id)
                | (MarketplaceOrder.seller_id == (seller.id if seller else -1))
            )
        ).all()
    ]
    disputes = db.scalars(select(Dispute).where(Dispute.order_id.in_(order_ids))).all() if order_ids else []
    return {
        "items": [
            {
                "id": dispute.id,
                "order_id": dispute.order_id,
                "opened_by": dispute.opened_by,
                "reason": dispute.reason,
                "evidence_url": dispute.evidence_url,
                "status": dispute.status,
                "resolution": dispute.resolution,
                "created_at": dispute.created_at.isoformat(),
                "resolved_at": dispute.resolved_at.isoformat() if dispute.resolved_at else None,
            }
            for dispute in disputes
        ]
    }


@router.post("/reviews", status_code=201)
def create_seller_review(
    payload: SellerReviewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.get(MarketplaceOrder, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can review this order")
    if order.status not in {"paid_sandbox", "completed"}:
        raise HTTPException(status_code=400, detail="Order is not eligible for review")
    if db.scalar(select(SellerReview).where(SellerReview.order_id == order.id)) is not None:
        raise HTTPException(status_code=409, detail="Order already reviewed")
    review = SellerReview(
        seller_id=order.seller_id,
        buyer_id=user.id,
        order_id=order.id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    seller = db.get(MarketplaceSeller, order.seller_id)
    if seller is not None:
        agg = db.execute(
            select(func.avg(SellerReview.rating), func.count(SellerReview.id)).where(SellerReview.seller_id == seller.id)
        ).one()
        total = float(agg[0] or 0) * int(agg[1] or 0) + payload.rating
        count = int(agg[1] or 0) + 1
        seller.review_count = count
        seller.rating = Decimal(str(round(total / count, 1)))
        seller.reputation_score = Decimal(str(_reputation(seller)["score"]))
    db.commit()
    db.refresh(review)
    return {"id": review.id, "seller_id": review.seller_id, "rating": review.rating, "created_at": review.created_at.isoformat()}


@router.post("/reports", status_code=201)
def report_coupon(
    payload: CouponReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.get(MarketplaceListing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if payload.order_id is not None:
        order = db.get(MarketplaceOrder, payload.order_id)
        if order is None or order.buyer_id != user.id or order.listing_id != listing.id:
            raise HTTPException(status_code=403, detail="Invalid order for this report")
    existing = db.scalar(
        select(MarketplaceCouponReport).where(
            MarketplaceCouponReport.listing_id == listing.id,
            MarketplaceCouponReport.reporter_id == user.id,
            MarketplaceCouponReport.status == "open",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="You already have an open report for this listing")
    report = MarketplaceCouponReport(
        listing_id=listing.id,
        order_id=payload.order_id,
        reporter_id=user.id,
        reason=payload.reason,
        evidence_url=payload.evidence_url,
        status="open",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "listing_id": listing.id, "status": report.status, "created_at": report.created_at.isoformat()}


@router.get("/reports")
def list_my_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reports = db.scalars(
        select(MarketplaceCouponReport).where(MarketplaceCouponReport.reporter_id == user.id).order_by(MarketplaceCouponReport.id.desc())
    ).all()
    return {
        "items": [
            {"id": report.id, "listing_id": report.listing_id, "reason": report.reason, "status": report.status, "resolution": report.resolution, "created_at": report.created_at.isoformat()}
            for report in reports
        ]
    }


def resolve_dispute_admin(db: Session, dispute: Dispute, payload: DisputeResolution, admin: User) -> dict:
    order = db.get(MarketplaceOrder, dispute.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if dispute.resolved_at is not None or dispute.status.startswith("resolved_"):
        raise HTTPException(status_code=409, detail="Dispute is already resolved")
    dispute.status = payload.status
    dispute.resolution = payload.resolution
    dispute.resolved_at = NOW()
    seller = db.get(MarketplaceSeller, order.seller_id)
    if payload.status == "resolved_refunded":
        order.status = "refunded"
        order.refunded_at = NOW()
        if seller is not None:
            seller.disputes_lost += 1
        db.add(
            Transaction(
                order_id=order.id,
                provider="sandbox",
                provider_reference=f"refund_{secrets.token_hex(6)}",
                amount=order.amount,
                currency="INR",
                status="refunded_sandbox",
                type="refund",
                meta={
                    "note": "Sandbox refund recorded.",
                    "seller_payout_reversed": str(order.seller_payout),
                },
            )
        )
    else:
        order.status = "completed"
    if seller is not None:
        seller.reputation_score = Decimal(str(_reputation(seller)["score"]))
    record_audit(db, admin.id, "marketplace.dispute_resolve", "dispute", dispute.id, after=payload.model_dump())
    db.commit()
    return {
        "id": dispute.id,
        "order_id": order.id,
        "status": dispute.status,
        "order_status": order.status,
        "resolution": dispute.resolution,
    }

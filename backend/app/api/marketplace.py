from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_seller_or_admin
from app.models import (
    Dispute,
    MarketplaceListing,
    MarketplaceOrder,
    MarketplaceSeller,
    Transaction,
    User,
)
from app.schemas import (
    DisputeCreate,
    DisputeResolution,
    MarketplaceListingCreate,
    MarketplaceOrderCreate,
    SellerApplyRequest,
)
from app.services.audit import record_audit
from app.services.serializers import money

router = APIRouter(prefix="/api/marketplace", tags=["Coupon marketplace"])

FORBIDDEN_PAYMENT_KEYS = {"card", "card_number", "cvv", "cvc", "pan", "expiry", "upi_pin", "pin"}


def _seller_payload(seller: MarketplaceSeller) -> dict:
    return {
        "id": seller.id,
        "user_id": seller.user_id,
        "display_name": seller.display_name,
        "bio": seller.bio,
        "status": seller.status,
        "rating": money(seller.rating),
        "total_sales": seller.total_sales,
        "created_at": seller.created_at.isoformat(),
    }


def _listing_payload(listing: MarketplaceListing) -> dict:
    return {
        "id": listing.id,
        "seller_id": listing.seller_id,
        "title": listing.title,
        "description": listing.description,
        "category": listing.category,
        "price": money(listing.price),
        "proof_url": listing.proof_url,
        "expires_at": listing.expires_at.isoformat() if listing.expires_at else None,
        "status": listing.status,
        "is_transfer_allowed": listing.is_transfer_allowed,
        "created_at": listing.created_at.isoformat(),
    }


def _order_payload(order: MarketplaceOrder, listing: MarketplaceListing | None = None) -> dict:
    return {
        "id": order.id,
        "listing_id": order.listing_id,
        "listing_title": listing.title if listing else None,
        "buyer_id": order.buyer_id,
        "seller_id": order.seller_id,
        "amount": money(order.amount),
        "status": order.status,
        "payment_provider": order.payment_provider,
        "delivery_details": order.delivery_details,
        "created_at": order.created_at.isoformat(),
    }


@router.get("/listings")
def list_marketplace_listings(
    category: str | None = None,
    q: str = "",
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = select(MarketplaceListing).where(MarketplaceListing.status == "approved")
    if category:
        query = query.where(MarketplaceListing.category == category)
    if q:
        query = query.where(
            MarketplaceListing.title.ilike(f"%{q}%") | MarketplaceListing.description.ilike(f"%{q}%")
        )
    listings = db.scalars(query.order_by(MarketplaceListing.id.desc()).limit(limit)).all()
    return {
        "items": [_listing_payload(listing) for listing in listings],
        "total": len(listings),
        "note": "Marketplace transactions use a sandbox provider. Coupons may only be resold or transferred where issuer terms permit it.",
    }


@router.post("/seller/apply", status_code=201)
def apply_seller(
    payload: SellerApplyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))
    if existing:
        raise HTTPException(status_code=409, detail="Seller profile already exists")
    seller = MarketplaceSeller(
        user_id=user.id,
        display_name=payload.display_name,
        bio=payload.bio,
        status="pending",
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    return {**_seller_payload(seller), "note": "Seller applications require admin approval before listings go live."}


@router.get("/seller/me")
def seller_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))
    if seller is None:
        raise HTTPException(status_code=404, detail="No seller profile. Apply first.")
    listings = db.scalars(
        select(MarketplaceListing).where(MarketplaceListing.seller_id == seller.id).order_by(MarketplaceListing.id.desc())
    ).all()
    orders = db.scalars(select(MarketplaceOrder).where(MarketplaceOrder.seller_id == seller.id)).all()
    earnings = sum(
        (order.amount for order in orders if order.status in {"paid_sandbox", "completed"}),
        Decimal("0"),
    )
    return {
        "seller": _seller_payload(seller),
        "listings": [_listing_payload(listing) for listing in listings],
        "orders": [_order_payload(order) for order in orders],
        "earnings_sandbox": money(earnings),
        "note": "Earnings are sandbox records only; no live payment settlement occurs.",
    }


@router.post("/listings", status_code=201)
def create_marketplace_listing(
    payload: MarketplaceListingCreate,
    user: User = Depends(require_seller_or_admin),
    db: Session = Depends(get_db),
):
    seller = db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))
    if seller is None:
        raise HTTPException(status_code=400, detail="Seller profile required")
    if seller.status != "approved":
        raise HTTPException(status_code=403, detail="Seller profile is not approved")
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
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return {**_listing_payload(listing), "note": "Listing is pending admin verification."}


@router.get("/orders")
def list_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))
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


@router.post("/orders", status_code=201)
def create_order(
    payload: MarketplaceOrderCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.get(MarketplaceListing, payload.listing_id)
    if listing is None or listing.status != "approved":
        raise HTTPException(status_code=404, detail="Approved listing not found")
    seller = db.get(MarketplaceSeller, listing.seller_id)
    if seller is None or seller.status != "approved":
        raise HTTPException(status_code=400, detail="Seller is not approved")
    if seller.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot buy your own listing")
    if not listing.is_transfer_allowed:
        raise HTTPException(status_code=400, detail="Issuer terms do not permit resale or transfer of this listing")
    expires = listing.expires_at
    if expires is not None:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Listing has expired")
    forbidden = FORBIDDEN_PAYMENT_KEYS.intersection({key.lower() for key in payload.delivery_details})
    if forbidden:
        raise HTTPException(status_code=400, detail="Raw payment credentials are not accepted; use the sandbox provider")

    reference = f"sbx_{secrets.token_hex(8)}"
    order = MarketplaceOrder(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=seller.id,
        amount=listing.price,
        status="paid_sandbox",
        payment_provider="sandbox",
        delivery_details=payload.delivery_details,
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
            meta={"note": "Sandbox transaction; no real money moved."},
        )
    )
    listing.status = "sold"
    db.commit()
    db.refresh(order)
    return {
        **_order_payload(order, listing),
        "transaction_reference": reference,
        "note": "Sandbox payment recorded. No live payment was processed and no raw card data is accepted.",
    }


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
    dispute = Dispute(
        order_id=order.id,
        opened_by=user.id,
        reason=payload.reason,
        evidence_url=payload.evidence_url,
        status="open",
    )
    order.status = "disputed"
    db.add(dispute)
    db.commit()
    db.refresh(dispute)
    return {"id": dispute.id, "order_id": order.id, "status": dispute.status, "created_at": dispute.created_at.isoformat()}


@router.get("/disputes")
def list_disputes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seller = db.scalar(select(MarketplaceSeller).where(MarketplaceSeller.user_id == user.id))
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


def resolve_dispute_admin(db: Session, dispute: Dispute, payload: DisputeResolution, admin: User) -> dict:
    order = db.get(MarketplaceOrder, dispute.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    dispute.status = payload.status
    dispute.resolution = payload.resolution
    dispute.resolved_at = datetime.now(timezone.utc)
    if payload.status == "resolved_refunded":
        order.status = "refunded"
        db.add(
            Transaction(
                order_id=order.id,
                provider="sandbox",
                provider_reference=f"refund_{secrets.token_hex(6)}",
                amount=order.amount,
                currency="INR",
                status="refunded_sandbox",
                type="refund",
                meta={"note": "Sandbox refund recorded."},
            )
        )
    else:
        order.status = "completed"
    record_audit(db, admin.id, "marketplace.dispute_resolve", "dispute", dispute.id, after=payload.model_dump())
    db.commit()
    return {"id": dispute.id, "status": dispute.status, "resolution": dispute.resolution}

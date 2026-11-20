from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    AIConversation,
    AIMessage,
    MarketplaceListing,
    MarketplaceOrder,
    PriceAlert,
    Product,
    ProductListing,
    ProductVariant,
    Purchase,
    RecurringPurchase,
    ShoppingMemory,
    User,
    UserProfile,
    WarrantyRecord,
    Watchlist,
)
from app.schemas import (
    PurchaseCreate,
    RecurringPurchaseCreate,
    WarrantyCreate,
    WatchlistCreate,
)
from app.services.pricing import effective_price
from app.services.serializers import basic_listing_payload, money, product_payload

router = APIRouter(tags=["Account, purchases and tracking"])


@router.get("/api/watchlist")
def list_watchlist(
    list_type: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Watchlist).where(Watchlist.user_id == user.id)
    if list_type:
        query = query.where(Watchlist.list_type == list_type)
    items = db.scalars(query.order_by(Watchlist.id.desc())).all()
    payload = []
    for item in items:
        product = db.get(Product, item.product_id)
        if product is None:
            continue
        listings = db.scalars(select(ProductListing).where(ProductListing.product_id == product.id)).all()
        cheapest = min(listings, key=lambda listing: listing.price) if listings else None
        payload.append(
            {
                "id": item.id,
                "list_type": item.list_type,
                "notes": item.notes,
                "product": product_payload(product),
                "lowest_price": money(cheapest.price) if cheapest else None,
                "lowest_effective_price": effective_price(db, cheapest)["effective_price"] if cheapest else None,
                "created_at": item.created_at.isoformat(),
            }
        )
    return {"items": payload, "total": len(payload)}


@router.post("/api/watchlist", status_code=201)
def add_watchlist(
    payload: WatchlistCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = db.scalar(
        select(Watchlist).where(
            Watchlist.user_id == user.id,
            Watchlist.product_id == payload.product_id,
            Watchlist.list_type == payload.list_type,
        )
    )
    if existing:
        existing.notes = payload.notes or existing.notes
        db.commit()
        return {"id": existing.id, "status": "existing"}
    item = Watchlist(
        user_id=user.id,
        product_id=payload.product_id,
        list_type=payload.list_type,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": "created", "list_type": item.list_type}


@router.delete("/api/watchlist/{item_id}")
def delete_watchlist(
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(Watchlist, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}


@router.get("/api/purchases")
def list_purchases(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    purchases = db.scalars(
        select(Purchase).where(Purchase.user_id == user.id).order_by(Purchase.purchased_at.desc())
    ).all()
    items = []
    for purchase in purchases:
        listing = db.get(ProductListing, purchase.listing_id)
        product = db.get(Product, purchase.product_id)
        listings = db.scalars(
            select(ProductListing).where(
                ProductListing.product_id == purchase.product_id,
                ProductListing.variant_id == listing.variant_id if listing else None,
            )
        ).all()
        current = min(listings, key=lambda item: item.price) if listings else None
        items.append(
            {
                "id": purchase.id,
                "product": product_payload(product) if product else None,
                "listing_id": purchase.listing_id,
                "price": money(purchase.price),
                "quantity": purchase.quantity,
                "purchased_at": purchase.purchased_at.isoformat(),
                "current_lowest_price": money(current.price) if current else None,
                "price_change": money(current.price - purchase.price) if current else None,
                "retailer_id": purchase.retailer_id,
            }
        )
    return {"items": items, "total": len(items)}


@router.post("/api/purchases", status_code=201)
def create_purchase(
    payload: PurchaseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = db.get(ProductListing, payload.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    purchase = Purchase(
        user_id=user.id,
        listing_id=listing.id,
        product_id=listing.product_id,
        retailer_id=listing.retailer_id,
        price=listing.price * payload.quantity,
        quantity=payload.quantity,
        purchased_at=payload.purchased_at or datetime.now(timezone.utc),
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)
    return {
        "id": purchase.id,
        "price": money(purchase.price),
        "note": "Post-purchase tracking will monitor later prices. DISCOUNT AI does not promise refunds because prices fall after purchase.",
    }


@router.get("/api/purchases/{purchase_id}/tracking")
def purchase_tracking(
    purchase_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    purchase = db.get(Purchase, purchase_id)
    if purchase is None or purchase.user_id != user.id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    source_listing = db.get(ProductListing, purchase.listing_id)
    listings = db.scalars(
        select(ProductListing).where(
            ProductListing.product_id == purchase.product_id,
            ProductListing.variant_id == source_listing.variant_id,
        )
    ).all()
    cheapest = min(listings, key=lambda item: item.price) if listings else None
    current_price = cheapest.price if cheapest else purchase.price
    difference = current_price - purchase.price
    return {
        "purchase_id": purchase.id,
        "purchase_price": money(purchase.price),
        "current_lowest_price": money(current_price),
        "difference": money(difference),
        "direction": "cheaper_now" if difference < 0 else "higher_now" if difference > 0 else "unchanged",
        "cheapest_listing": basic_listing_payload(cheapest, db) if cheapest else None,
        "notice": "If the current price is lower, you may be able to use retailer policies. DISCOUNT AI does not guarantee refunds or price protection.",
    }


@router.get("/api/recurring-purchases")
def list_recurring(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.scalars(
        select(RecurringPurchase).where(RecurringPurchase.user_id == user.id).order_by(RecurringPurchase.id.desc())
    ).all()
    items = []
    for record in records:
        product = db.get(Product, record.product_id)
        listings = db.scalars(select(ProductListing).where(ProductListing.product_id == record.product_id)).all()
        cheapest = min(listings, key=lambda item: item.price) if listings else None
        current = cheapest.price if cheapest else record.last_price
        items.append(
            {
                "id": record.id,
                "product": product_payload(product) if product else None,
                "label": record.label,
                "interval_days": record.interval_days,
                "last_purchased_at": record.last_purchased_at.isoformat(),
                "last_price": money(record.last_price),
                "current_lowest_price": money(current),
                "savings_if_rebought": money(record.last_price - current),
                "next_reminder_at": record.next_reminder_at.isoformat() if record.next_reminder_at else None,
                "active": record.active,
            }
        )
    return {"items": items, "total": len(items)}


@router.post("/api/recurring-purchases", status_code=201)
def create_recurring(
    payload: RecurringPurchaseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    record = RecurringPurchase(
        user_id=user.id,
        product_id=payload.product_id,
        label=payload.label,
        interval_days=payload.interval_days,
        last_price=payload.last_price,
        last_purchased_at=datetime.now(timezone.utc),
        next_reminder_at=datetime.now(timezone.utc) + timedelta(days=payload.interval_days),
        active=True,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "next_reminder_at": record.next_reminder_at.isoformat()}


@router.delete("/api/recurring-purchases/{record_id}")
def delete_recurring(
    record_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = db.get(RecurringPurchase, record_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="Recurring purchase not found")
    record.active = False
    db.commit()
    return {"status": "paused", "id": record.id}


@router.get("/api/warranty")
def list_warranty(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.scalars(
        select(WarrantyRecord)
        .where(WarrantyRecord.user_id == user.id)
        .order_by(WarrantyRecord.id.desc())
    ).all()
    return {
        "items": [
            {
                "id": record.id,
                "purchase_id": record.purchase_id,
                "product_id": record.product_id,
                "retailer_id": record.retailer_id,
                "warranty_months": record.warranty_months,
                "provider": record.provider,
                "coverage": record.coverage,
                "source_url": record.source_url,
                "verified_at": record.verified_at.isoformat(),
                "is_demo": record.is_demo,
            }
            for record in records
        ]
    }


@router.post("/api/warranty", status_code=201)
def create_warranty(
    payload: WarrantyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.variant_id is not None:
        variant = db.get(ProductVariant, payload.variant_id)
        if variant is None or variant.product_id != product.id:
            raise HTTPException(status_code=400, detail="Variant does not belong to this product")
    if payload.purchase_id is not None:
        purchase = db.get(Purchase, payload.purchase_id)
        if purchase is None or purchase.user_id != user.id:
            raise HTTPException(status_code=404, detail="Purchase not found")
        if purchase.product_id != product.id or purchase.retailer_id != payload.retailer_id:
            raise HTTPException(status_code=400, detail="Warranty must match the tracked purchase")
    record = WarrantyRecord(
        user_id=user.id,
        purchase_id=payload.purchase_id,
        product_id=payload.product_id,
        variant_id=payload.variant_id,
        retailer_id=payload.retailer_id,
        warranty_months=payload.warranty_months,
        provider=payload.provider,
        coverage=payload.coverage,
        source_url=payload.source_url,
        is_demo=False,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {"id": record.id, "verified_at": record.verified_at.isoformat()}


@router.get("/api/privacy/export")
def privacy_export(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id)).all()
    purchases = db.scalars(select(Purchase).where(Purchase.user_id == user.id)).all()
    recurring = db.scalars(select(RecurringPurchase).where(RecurringPurchase.user_id == user.id)).all()
    watchlist = db.scalars(select(Watchlist).where(Watchlist.user_id == user.id)).all()
    memories = db.scalars(select(ShoppingMemory).where(ShoppingMemory.user_id == user.id)).all()
    warranties = db.scalars(select(WarrantyRecord).where(WarrantyRecord.user_id == user.id)).all()
    conversations = db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)).all()
    conversation_ids = [conversation.id for conversation in conversations]
    messages = (
        db.scalars(select(AIMessage).where(AIMessage.conversation_id.in_(conversation_ids))).all()
        if conversation_ids
        else []
    )
    preferences = user.preferences
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "role": user.role,
            "created_at": user.created_at.isoformat(),
            "profile": {
                "city": profile.city if profile else None,
                "state": profile.state if profile else None,
                "pincode": profile.pincode if profile else None,
            },
        },
        "preferences": {
            "preferred_brands": preferences.preferred_brands if preferences else [],
            "categories": preferences.categories if preferences else [],
            "notify_email": preferences.notify_email if preferences else False,
            "consent_analytics": preferences.consent_analytics if preferences else False,
        },
        "price_alerts": [{"id": alert.id, "target_price": money(alert.target_price), "status": alert.status} for alert in alerts],
        "purchases": [{"id": purchase.id, "product_id": purchase.product_id, "price": money(purchase.price)} for purchase in purchases],
        "recurring_purchases": [{"id": record.id, "label": record.label} for record in recurring],
        "watchlist": [{"id": item.id, "product_id": item.product_id, "list_type": item.list_type} for item in watchlist],
        "warranty_records": [
            {"id": record.id, "product_id": record.product_id, "provider": record.provider}
            for record in warranties
        ],
        "shopping_memory": [
            {
                "memory_type": memory.memory_type,
                "memory_key": memory.memory_key,
                "memory_value": memory.memory_value,
                "consent": memory.consent,
            }
            for memory in memories
        ],
        "ai_conversations": [
            {
                "id": conversation.id,
                "title": conversation.title,
                "messages": [
                    {"role": message.role, "content": message.content}
                    for message in messages
                    if message.conversation_id == conversation.id
                ],
            }
            for conversation in conversations
        ],
        "notice": "This export is provided for DPDP access/deletion workflows. Review with qualified counsel before production use.",
    }


@router.get("/api/account/savings")
def savings_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    purchases = db.scalars(select(Purchase).where(Purchase.user_id == user.id)).all()
    orders = db.scalars(select(MarketplaceOrder).where(MarketplaceOrder.buyer_id == user.id)).all()
    listings = {
        listing.id: listing
        for listing in db.scalars(
            select(MarketplaceListing).where(MarketplaceListing.id.in_({order.listing_id for order in orders}))
        ).all()
    } if orders else {}
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id)).all()

    monthly: dict[str, dict[str, float]] = {}
    by_retailer: dict[str, dict[str, float]] = {}
    verified_savings = Decimal("0")
    estimated_coupon_savings = Decimal("0")
    coupons_redeemed = 0
    coupons_purchased = 0
    for order in orders:
        listing = listings.get(order.listing_id)
        if listing is None or order.status not in {"paid_sandbox", "completed"}:
            continue
        coupons_purchased += 1
        saving = max(Decimal("0"), Decimal(listing.coupon_value or 0) - Decimal(order.amount))
        estimated_coupon_savings += saving
        if order.redemption_status == "redeemed":
            coupons_redeemed += 1
            verified_savings += saving
        month = order.created_at.strftime("%Y-%m")
        monthly.setdefault(month, {"verified": 0.0, "estimated": 0.0})
        monthly[month]["estimated"] += float(saving)
        if order.redemption_status == "redeemed":
            monthly[month]["verified"] += float(saving)
        retailer = f"retailer:{listing.retailer_id}" if listing.retailer_id else "marketplace"
        by_retailer.setdefault(retailer, {"verified": 0.0, "estimated": 0.0})
        by_retailer[retailer]["estimated"] += float(saving)
        if order.redemption_status == "redeemed":
            by_retailer[retailer]["verified"] += float(saving)

    price_drops = 0
    estimated_price_savings = Decimal("0")
    for purchase in purchases:
        listing = db.scalar(
            select(ProductListing)
            .where(ProductListing.product_id == purchase.product_id)
            .order_by(ProductListing.price.asc())
        )
        if listing is None:
            continue
        drop = (Decimal(purchase.price) - Decimal(listing.price)).quantize(Decimal("0.01"))
        if drop > 0:
            price_drops += 1
            estimated_price_savings += drop * purchase.quantity
            month = purchase.purchased_at.strftime("%Y-%m")
            monthly.setdefault(month, {"verified": 0.0, "estimated": 0.0})
            monthly[month]["estimated"] += float(drop * purchase.quantity)
            key = f"retailer:{purchase.retailer_id}"
            by_retailer.setdefault(key, {"verified": 0.0, "estimated": 0.0})
            by_retailer[key]["estimated"] += float(drop * purchase.quantity)

    monthly_history = [
        {"month": month, **{k: round(v, 2) for k, v in values.items()}}
        for month, values in sorted(monthly.items())
    ]
    return {
        "verified_savings": money(verified_savings),
        "estimated_savings": money(estimated_coupon_savings + estimated_price_savings),
        "coupons_purchased": coupons_purchased,
        "coupons_redeemed": coupons_redeemed,
        "price_drops_detected": price_drops,
        "estimated_price_drops": money(estimated_price_savings),
        "successful_deal_discoveries": price_drops + coupons_redeemed,
        "alerts_created": len(alerts),
        "alerts_triggered": sum(1 for alert in alerts if alert.triggered_at is not None),
        "savings_by_retailer": [
            {"retailer": key, **{k: round(v, 2) for k, v in values.items()}}
            for key, values in sorted(by_retailer.items())
        ],
        "monthly_history": monthly_history,
        "definitions": {
            "verified": "Only savings from a purchased marketplace coupon the buyer marked as redeemed. No fabricated savings are included.",
            "estimated": "Coupon value minus paid price for other purchases plus price drops detected against the current lowest store price. Not independently verified.",
        },
        "checked_at": now.isoformat(),
    }

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user, require_admin
from app.models import (
    AffiliateClick,
    AnalyticsEvent,
    Notification,
    PriceAlert,
    ProductListing,
    Purchase,
    User,
    Watchlist,
)
from app.schemas import AnalyticsEventCreate
from app.services.pricing import effective_price
from app.services.serializers import money

router = APIRouter(tags=["Analytics and affiliate"])


@router.post("/api/analytics/events", status_code=201)
def record_event(
    payload: AnalyticsEventCreate,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    analytics_consent = True
    if user is not None and user.preferences is not None:
        analytics_consent = user.preferences.consent_analytics
    event = AnalyticsEvent(
        user_id=user.id if user and analytics_consent else None,
        session_id=payload.session_id,
        event_type=payload.event_type,
        product_id=payload.product_id,
        listing_id=payload.listing_id,
        meta=payload.meta if analytics_consent else {"deidentified": True},
    )
    db.add(event)
    db.commit()
    return {"id": event.id, "recorded": True, "consent_applied": analytics_consent}


@router.get("/api/analytics/summary")
def personal_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    event_counts: dict[str, int] = {}
    events = db.scalars(select(AnalyticsEvent).where(AnalyticsEvent.user_id == user.id)).all()
    for event in events:
        event_counts[event.event_type] = event_counts.get(event.event_type, 0) + 1
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id)).all()
    saved = db.scalars(select(Watchlist).where(Watchlist.user_id == user.id)).all()
    purchases = db.scalars(select(Purchase).where(Purchase.user_id == user.id)).all()
    notifications = db.scalars(select(Notification).where(Notification.user_id == user.id)).all()
    return {
        "event_counts": event_counts,
        "alerts": len([alert for alert in alerts if alert.status != "deleted"]),
        "triggered_alerts": len([alert for alert in alerts if alert.status == "triggered"]),
        "saved_products": len(saved),
        "purchases": len(purchases),
        "notifications": len(notifications),
        "unread_notifications": len([item for item in notifications if item.read_at is None]),
        "spend_tracked": money(sum((purchase.price for purchase in purchases), Decimal("0"))),
    }


def compute_metrics(db: Session) -> dict:
    def count(model, *conditions) -> int:
        query = select(func.count()).select_from(model)
        if conditions:
            query = query.where(*conditions)
        return int(db.scalar(query) or 0)

    searches = count(AnalyticsEvent, AnalyticsEvent.event_type == "search")
    comparisons = count(AnalyticsEvent, AnalyticsEvent.event_type == "comparison")
    cheaper_clicks = count(AffiliateClick, AffiliateClick.comparison_cheapest.is_(True))
    total_clicks = count(AffiliateClick)
    saved = count(Watchlist)
    alerts = count(PriceAlert)
    ai_recs = count(AnalyticsEvent, AnalyticsEvent.event_type == "ai_recommendation")
    purchases = count(Purchase)

    comparison_events = db.scalars(select(AnalyticsEvent).where(AnalyticsEvent.event_type == "comparison")).all()
    savings = Decimal("0")
    for event in comparison_events:
        value = (event.meta or {}).get("savings_identified")
        if value:
            savings += Decimal(str(value))

    listings = db.scalars(select(ProductListing)).all()
    now = datetime.now(timezone.utc)
    ages = []
    for listing in listings:
        checked = listing.last_checked_at if listing.last_checked_at.tzinfo else listing.last_checked_at.replace(tzinfo=timezone.utc)
        ages.append((now - checked).total_seconds() / 3600)
    avg_freshness = round(sum(ages) / len(ages), 2) if ages else None

    notification_rows = db.scalars(select(Notification)).all()
    notification_status: dict[str, int] = {}
    for item in notification_rows:
        notification_status[item.status] = notification_status.get(item.status, 0) + 1

    cutoff = now - timedelta(days=30)
    users_with_events = {
        event.user_id for event in db.scalars(select(AnalyticsEvent).where(AnalyticsEvent.user_id.is_not(None))).all()
    }
    repeat_users = {
        user_id
        for user_id, total in db.execute(
            select(AnalyticsEvent.user_id, func.count(AnalyticsEvent.id))
            .where(AnalyticsEvent.created_at >= cutoff, AnalyticsEvent.user_id.is_not(None))
            .group_by(AnalyticsEvent.user_id)
        ).all()
        if total >= 2
    }
    retention = round(len(repeat_users) / len(users_with_events) * 100, 1) if users_with_events else None

    ctr = round(cheaper_clicks / comparisons * 100, 2) if comparisons else None
    return {
        "primary_metric": {
            "name": "cheaper_store_click_through_rate",
            "value_pct": ctr,
            "cheaper_store_clicks": cheaper_clicks,
            "comparison_sessions": comparisons,
            "definition": "Affiliate clicks to the cheapest exact-variant listing divided by recorded comparison sessions. Commission never affects ranking.",
        },
        "searches": searches,
        "comparisons": comparisons,
        "affiliate_clicks": total_clicks,
        "cheaper_store_clicks": cheaper_clicks,
        "saved_products": saved,
        "price_alerts": alerts,
        "savings_identified": money(savings),
        "ai_recommendations": ai_recs,
        "purchases_tracked": purchases,
        "product_matching_accuracy": None,
        "product_matching_accuracy_note": "No labelled benchmark is bundled. Exact-variant matching is enforced by the API; accuracy must be measured against an approved labelled dataset.",
        "data_freshness_avg_hours": avg_freshness,
        "notification_delivery": notification_status,
        "retention_30d_pct": retention,
        "retention_note": "Proxy metric: users with 2+ analytics events in 30 days divided by users with any recent event.",
        "generated_at": now.isoformat(),
    }


@router.get("/api/analytics/metrics")
def metrics(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return compute_metrics(db)


@router.get("/api/analytics/admin")
def admin_analytics(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return compute_metrics(db)


@router.get("/api/affiliate/click/{listing_id}")
def affiliate_click(
    listing_id: int,
    session_id: str | None = None,
    source_page: str = "unknown",
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    listing = db.get(ProductListing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    effective = effective_price(db, listing)
    siblings = db.scalars(
        select(ProductListing).where(
            ProductListing.product_id == listing.product_id,
            ProductListing.variant_id == listing.variant_id,
        )
    ).all()
    cheapest = min(
        siblings,
        key=lambda item: Decimal(str(effective_price(db, item)["effective_price"])),
    )
    is_cheapest = cheapest.id == listing.id
    db.add(
        AffiliateClick(
            listing_id=listing.id,
            product_id=listing.product_id,
            user_id=user.id if user else None,
            session_id=session_id,
            effective_price=Decimal(str(effective["effective_price"])),
            comparison_cheapest=is_cheapest,
            source_page=source_page,
        )
    )
    db.add(
        AnalyticsEvent(
            user_id=user.id if user else None,
            session_id=session_id,
            event_type="cheaper_store_click" if is_cheapest else "affiliate_click",
            product_id=listing.product_id,
            listing_id=listing.id,
            meta={"is_cheapest": is_cheapest, "source_page": source_page},
        )
    )
    db.commit()
    return RedirectResponse(url=listing.url, status_code=307)

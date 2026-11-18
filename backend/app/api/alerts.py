from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import PriceAlert, Product, ProductVariant, User
from app.schemas import AlertCreate, AlertUpdate
from app.services.notifications import check_price_alerts, notify_user
from app.services.serializers import money

router = APIRouter(prefix="/api/alerts", tags=["Price alerts"])


def _alert_payload(alert: PriceAlert) -> dict:
    return {
        "id": alert.id,
        "product_id": alert.product_id,
        "variant_id": alert.variant_id,
        "target_price": money(alert.target_price),
        "status": alert.status,
        "channel": alert.channel,
        "last_checked_at": alert.last_checked_at.isoformat() if alert.last_checked_at else None,
        "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
        "created_at": alert.created_at.isoformat(),
    }


@router.get("")
def list_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = db.scalars(
        select(PriceAlert).where(PriceAlert.user_id == user.id, PriceAlert.status != "deleted").order_by(PriceAlert.id.desc())
    ).all()
    return {"items": [_alert_payload(alert) for alert in alerts], "total": len(alerts)}


@router.post("", status_code=201)
def create_alert(
    payload: AlertCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.variant_id is not None:
        variant = db.get(ProductVariant, payload.variant_id)
        if variant is None or variant.product_id != product.id:
            raise HTTPException(status_code=400, detail="Variant does not belong to product")
    existing = db.scalar(
        select(PriceAlert).where(
            PriceAlert.user_id == user.id,
            PriceAlert.product_id == payload.product_id,
            PriceAlert.variant_id == payload.variant_id,
            PriceAlert.status == "active",
        )
    )
    if existing is not None:
        existing.target_price = payload.target_price
        existing.channel = payload.channel
        db.commit()
        return _alert_payload(existing)
    alert = PriceAlert(
        user_id=user.id,
        product_id=payload.product_id,
        variant_id=payload.variant_id,
        target_price=payload.target_price,
        channel=payload.channel,
        status="active",
    )
    db.add(alert)
    notify_user(
        db,
        user,
        "alert_created",
        "Price alert created",
        f"We will track {product.name} against your target of Rs {money(payload.target_price):,.0f}.",
        channels=["in_app"],
    )
    db.commit()
    db.refresh(alert)
    return _alert_payload(alert)


@router.patch("/{alert_id}")
def update_alert(
    alert_id: int,
    payload: AlertUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = db.get(PriceAlert, alert_id)
    if alert is None or alert.user_id != user.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    if payload.target_price is not None:
        alert.target_price = payload.target_price
    if payload.channel is not None:
        alert.channel = payload.channel
    if payload.status is not None:
        alert.status = payload.status
    db.commit()
    return _alert_payload(alert)


@router.delete("/{alert_id}")
def delete_alert(
    alert_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    alert = db.get(PriceAlert, alert_id)
    if alert is None or alert.user_id != user.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "deleted"
    db.commit()
    return {"status": "deleted", "id": alert.id}


@router.post("/check")
def run_alert_check(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    triggered = check_price_alerts(db)
    return {"checked_by": admin.id, "triggered": triggered, "count": len(triggered)}

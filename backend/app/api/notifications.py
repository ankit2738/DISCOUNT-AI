from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Notification, User
from app.services.notifications import notify_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def _payload(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "channel": notification.channel,
        "status": notification.status,
        "provider_message_id": notification.provider_message_id,
        "error": notification.error,
        "read": notification.read_at is not None,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "created_at": notification.created_at.isoformat(),
    }


@router.get("")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    items = db.scalars(query.order_by(Notification.id.desc()).limit(limit)).all()
    unread = db.scalar(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return {"items": [_payload(item) for item in items], "total": len(items), "has_unread": unread is not None}


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": notification.id, "read": True}


@router.post("/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notifications = db.scalars(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ).all()
    now = datetime.now(timezone.utc)
    for notification in notifications:
        notification.read_at = now
    db.commit()
    return {"status": "read_all", "count": len(notifications)}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notification)
    db.commit()
    return {"status": "deleted"}


@router.get("/providers")
def providers():
    return {
        "channels": [
            {"channel": "in_app", "configured": True, "live": True, "note": "Stored in the application database."},
            {"channel": "email", "configured": settings.email_provider != "console", "live": False, "note": f"Provider mode: {settings.email_provider}. Console mode does not deliver external email."},
            {"channel": "push", "configured": False, "live": False, "note": "Browser push requires VAPID keys and a service-worker subscription."},
            {"channel": "telegram", "configured": bool(settings.telegram_bot_token), "live": bool(settings.telegram_bot_token), "note": "Telegram Bot API is called only when a token and user chat ID are configured."},
            {"channel": "whatsapp", "configured": bool(settings.whatsapp_token and settings.whatsapp_phone_number_id), "live": bool(settings.whatsapp_token and settings.whatsapp_phone_number_id), "note": "WhatsApp Business Cloud API templates/billing may be required."},
        ],
        "honesty_note": "Configured status is based on server environment variables. Delivery is only asserted when a provider returns a message ID.",
    }


@router.post("/test")
def send_test_notification(
    channel: str = Query(default="in_app"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    results = notify_user(
        db,
        user,
        "system_test",
        "DISCOUNT AI test notification",
        "This is a test notification. External delivery status is reported honestly.",
        channels=[channel],
    )
    return {"results": results, "note": "Only status 'sent' with a provider message ID confirms external delivery."}

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Notification, PriceAlert, ProductListing, User
from app.services.pricing import effective_price
from app.services.serializers import money

logger = logging.getLogger("discount_ai.notifications")


def _notification_payload(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "channel": notification.channel,
        "status": notification.status,
        "provider_message_id": notification.provider_message_id,
        "error": notification.error,
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "created_at": notification.created_at.isoformat(),
    }


def send_telegram(chat_id: str, text: str) -> tuple[str, str | None, str | None]:
    if not settings.telegram_bot_token:
        return "skipped", None, "TELEGRAM_BOT_TOKEN is not configured"
    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok"):
            description = str(payload.get("description") or "Telegram rejected the request")
            return "failed", None, description[:300]
        return "sent", str(payload.get("result", {}).get("message_id")), None
    except httpx.HTTPStatusError as exc:
        return "failed", None, f"Telegram API returned HTTP {exc.response.status_code}"
    except httpx.HTTPError as exc:
        return "failed", None, f"Telegram request failed: {type(exc).__name__}"


def send_whatsapp(phone: str, text: str) -> tuple[str, str | None, str | None]:
    if not settings.whatsapp_token or not settings.whatsapp_phone_number_id:
        return "skipped", None, "WhatsApp Cloud API credentials are not configured"
    try:
        response = httpx.post(
            f"https://graph.facebook.com/v20.0/{settings.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
            json={
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "text",
                "text": {"body": text},
            },
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        message_id = None
        try:
            message_id = payload["messages"][0]["id"]
        except (KeyError, IndexError):
            pass
        return "sent", message_id, None
    except Exception as exc:  # noqa: BLE001
        return "failed", None, f"{type(exc).__name__}: {exc}"[:300]


def notify_user(
    db: Session,
    user: User,
    notification_type: str,
    title: str,
    body: str,
    channels: Iterable[str] | None = None,
) -> list[dict]:
    preferences = user.preferences
    requested = list(channels) if channels is not None else ["in_app"]
    results: list[dict] = []
    for channel in requested:
        notification = Notification(
            user_id=user.id,
            type=notification_type,
            title=title,
            body=body,
            channel=channel,
            status="pending",
        )
        if channel == "in_app":
            notification.status = "in_app"
        elif channel == "email":
            if preferences is not None and not preferences.notify_email:
                notification.status = "skipped"
                notification.error = "Email notifications disabled by user preference"
            else:
                notification.status = "console"
                notification.error = "Email provider is console mode; no external email was delivered"
                logger.info("EMAIL (console): %s - %s", title, body)
        elif channel == "push":
            notification.status = "not_configured"
            notification.error = "Browser push requires VAPID keys and a registered service worker subscription"
        elif channel == "telegram":
            if preferences is None or not preferences.notify_telegram or not preferences.telegram_chat_id:
                notification.status = "skipped"
                notification.error = "Telegram consent or chat ID missing"
            else:
                status, message_id, error = send_telegram(preferences.telegram_chat_id, f"{title}\n\n{body}")
                notification.status = status
                notification.provider_message_id = message_id
                notification.error = error
        elif channel == "whatsapp":
            if preferences is None or not preferences.notify_whatsapp or not preferences.whatsapp_number:
                notification.status = "skipped"
                notification.error = "WhatsApp consent or number missing"
            else:
                status, message_id, error = send_whatsapp(preferences.whatsapp_number, f"{title}\n\n{body}")
                notification.status = status
                notification.provider_message_id = message_id
                notification.error = error
        else:
            notification.status = "skipped"
            notification.error = "Unsupported channel"
        db.add(notification)
        db.flush()
        results.append(_notification_payload(notification))
    db.commit()
    return results


def check_price_alerts(db: Session) -> list[dict]:
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.status == "active")).all()
    triggered: list[dict] = []
    now = datetime.now(timezone.utc)
    for alert in alerts:
        query = select(ProductListing).where(ProductListing.product_id == alert.product_id)
        if alert.variant_id is not None:
            query = query.where(ProductListing.variant_id == alert.variant_id)
        listings = db.scalars(query.order_by(ProductListing.price.asc())).all()
        if not listings:
            continue
        cheapest = min(listings, key=lambda item: Decimal(str(effective_price(db, item)["effective_price"])))
        price = Decimal(str(effective_price(db, cheapest)["effective_price"]))
        alert.last_checked_at = now
        if price <= alert.target_price:
            alert.status = "triggered"
            alert.triggered_at = now
            user = db.get(User, alert.user_id)
            if user is not None:
                notify_user(
                    db,
                    user,
                    "price_drop",
                    "Price alert triggered",
                    f"Tracked price is now Rs {money(price):,.0f}, at or below your target of Rs {money(alert.target_price):,.0f}.",
                    channels=[alert.channel],
                )
            triggered.append(
                {
                    "alert_id": alert.id,
                    "user_id": alert.user_id,
                    "product_id": alert.product_id,
                    "target_price": money(alert.target_price),
                    "current_price": money(price),
                    "listing_id": cheapest.id,
                }
            )
    db.commit()
    return triggered

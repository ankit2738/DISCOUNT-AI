from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

from app.db import SessionLocal
from app.services.notifications import check_price_alerts

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("discount_ai", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    beat_schedule={
        "check-price-alerts": {
            "task": "app.worker.check_alerts_task",
            "schedule": crontab(minute="*/15"),
        },
        "refresh-demo-prices": {
            "task": "app.worker.refresh_prices_task",
            "schedule": crontab(minute=0, hour="*/6"),
        },
    },
)


@celery_app.task(name="app.worker.check_alerts_task")
def check_alerts_task() -> dict:
    with SessionLocal() as db:
        triggered = check_price_alerts(db)
    return {"triggered": len(triggered), "items": triggered}


@celery_app.task(name="app.worker.refresh_prices_task")
def refresh_prices_task() -> dict:
    from app.adapters.registry import ADAPTERS, get_adapter
    from app.core.config import settings

    if not settings.demo_mode:
        return {"updated": 0, "note": "Demo refresh is disabled outside demo mode"}
    updated = 0
    with SessionLocal() as db:
        for slug in ADAPTERS:
            adapter = get_adapter(slug, db)
            retailer = adapter.retailer()
            if retailer is None or retailer.integration_status != "demo":
                continue
            updated += adapter.refresh_demo_prices(seed=0)
    return {"updated_listings": updated, "note": "Demo price refresh completed"}

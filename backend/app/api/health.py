from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.models import Product, ProductListing, Retailer
from app.adapters.registry import all_adapter_statuses

router = APIRouter(tags=["Health"])


@router.get("/health")
def legacy_health() -> dict[str, str]:
    return {"status": "ok", "service": "discount-ai-backend"}


@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict:
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        db_status = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "service": "discount-ai-backend",
        "version": "0.2.0",
        "environment": settings.environment,
        "demo_mode": settings.demo_mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {"status": db_status, "scheme": settings.database_url.split(":", 1)[0]},
        "counts": {
            "products": int(db.scalar(select(func.count()).select_from(Product)) or 0),
            "listings": int(db.scalar(select(func.count()).select_from(ProductListing)) or 0),
            "retailers": int(db.scalar(select(func.count()).select_from(Retailer)) or 0),
        },
        "integrations": {
            "adapters": len(all_adapter_statuses(db)),
            "ai_provider": settings.ai_provider,
            "ai_external_configured": bool(settings.ai_api_key),
            "telegram_configured": bool(settings.telegram_bot_token),
            "whatsapp_configured": bool(settings.whatsapp_token and settings.whatsapp_phone_number_id),
            "payment_provider": settings.payment_provider,
        },
    }

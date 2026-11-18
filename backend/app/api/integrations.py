from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.adapters.registry import all_adapter_statuses
from app.db import get_db
from app.services.serializers import retailer_payload
from app.core.config import settings

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


@router.get("/status")
def integration_status(db: Session = Depends(get_db)):
    adapters = all_adapter_statuses(db)
    return {
        "adapters": adapters,
        "ai": {
            "provider": settings.ai_provider,
            "external_configured": settings.ai_provider in {"openai", "openai_compatible"} and bool(settings.ai_api_key),
            "fallback": "rule_based_fallback",
        },
        "notifications": {
            "telegram_configured": bool(settings.telegram_bot_token),
            "whatsapp_configured": bool(settings.whatsapp_token and settings.whatsapp_phone_number_id),
            "email_provider": settings.email_provider,
        },
        "payments": {
            "provider": settings.payment_provider,
            "live": False,
            "note": "Sandbox only. Live payments require merchant onboarding, KYC and provider credentials.",
        },
        "database": {
            "url_scheme": settings.database_url.split(":", 1)[0],
            "production_recommended": "PostgreSQL via DATABASE_URL",
        },
        "demo_mode": settings.demo_mode,
        "honesty_note": "A status of demo means labelled fixtures are used. No unauthorized scraping is performed.",
    }

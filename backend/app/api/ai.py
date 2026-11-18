from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_optional_user
from app.models import AnalyticsEvent, Product, User
from app.schemas import ChatRequest
from app.services.ai import detect_category, get_ai_provider, grounded_products, parse_budget, rule_based_reply
from app.services.matching import search_catalog

router = APIRouter(prefix="/api/ai", tags=["AI shopping copilot"])


@router.post("/chat")
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    provider = get_ai_provider()
    budget = payload.budget or parse_budget(payload.message)
    category = payload.category or detect_category(payload.message)
    result = provider.chat(db, payload.message, budget, category)
    db.add(
        AnalyticsEvent(
            user_id=user.id if user else None,
            session_id=payload.session_id,
            event_type="ai_recommendation",
            meta={
                "provider": result.get("provider"),
                "grounded": result.get("grounded"),
                "recommendation_count": len(result.get("recommendations", [])),
            },
        )
    )
    db.commit()
    return {
        **result,
        "detected_budget": float(budget) if budget else None,
        "detected_category": category,
        "provider_configured": provider.name,
    }


@router.get("/recommendations")
def recommendations(
    budget: Decimal | None = Query(default=None, gt=0),
    category: str | None = None,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    products = grounded_products(db, budget, category)
    personalization = None
    if user is not None and user.preferences is not None and user.preferences.personalization_enabled:
        preferences = user.preferences
        preferred_brands = {brand.lower() for brand in (preferences.preferred_brands or [])}
        preferred_categories = {item.lower() for item in (preferences.categories or [])}
        for product in products:
            boost = 0
            if product["brand"].lower() in preferred_brands:
                boost += 10
            if product["category"].lower() in preferred_categories:
                boost += 5
            product["personalization_boost"] = boost
        products.sort(key=lambda item: item.get("personalization_boost", 0), reverse=True)
        personalization = {
            "enabled": True,
            "preferred_brands": preferences.preferred_brands,
            "categories": preferences.categories,
            "disclosure": "Personalization uses preferences you explicitly saved and can be disabled or deleted.",
        }
    return {
        "items": products,
        "total": len(products),
        "personalization": personalization,
        "methodology": "Only catalogued products within the requested budget/category are returned. No product, price or specification is invented.",
        "is_demo": True,
    }


@router.get("/providers")
def providers():
    from app.core.config import settings

    configured = settings.ai_provider in {"openai", "openai_compatible"} and bool(settings.ai_api_key)
    return {
        "provider": settings.ai_provider,
        "external_configured": configured,
        "fallback": "rule_based_fallback",
        "model": settings.ai_model if configured else None,
        "features": ["grounded retrieval", "tool declarations", "structured result envelope", "rule-based fallback"],
        "note": "If credentials are absent, deterministic rule-based recommendations grounded on the database are used.",
    }

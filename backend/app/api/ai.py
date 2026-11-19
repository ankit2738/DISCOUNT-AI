from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, get_optional_user
from app.models import (
    AIConversation,
    AIMessage,
    AnalyticsEvent,
    PriceAlert,
    Product,
    RecurringPurchase,
    ShoppingMemory,
    User,
    Watchlist,
)
from app.schemas import ChatRequest
from app.services.ai import detect_category, get_ai_provider, grounded_products, parse_budget, rule_based_reply
from app.services.matching import search_catalog

router = APIRouter(prefix="/api/ai", tags=["AI shopping copilot"])


def _context(db: Session, user: User | None) -> dict:
    if user is None:
        return {"authenticated": False}
    now = datetime.now(timezone.utc)
    memories = [
        memory
        for memory in db.scalars(
            select(ShoppingMemory).where(
                ShoppingMemory.user_id == user.id,
                ShoppingMemory.consent.is_(True),
            )
        ).all()
        if memory.expires_at is None
        or (memory.expires_at if memory.expires_at.tzinfo else memory.expires_at.replace(tzinfo=timezone.utc)) >= now
    ]
    alerts = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id)).all()
    watchlist = db.scalars(select(Watchlist).where(Watchlist.user_id == user.id)).all()
    recurring = db.scalars(
        select(RecurringPurchase).where(
            RecurringPurchase.user_id == user.id,
            RecurringPurchase.active.is_(True),
        )
    ).all()
    return {
        "authenticated": True,
        "memory": [
            {
                "type": item.memory_type,
                "key": item.memory_key,
                "value": item.memory_value,
            }
            for item in memories
        ],
        "saved_products": len(watchlist),
        "active_alerts": len([alert for alert in alerts if alert.status == "active"]),
        "recurring_purchases": len(recurring),
    }


@router.post("/chat")
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    provider = get_ai_provider()
    budget = payload.budget or parse_budget(payload.message)
    category = payload.category or detect_category(payload.message)
    context = _context(db, user) if payload.use_personal_context else {"authenticated": user is not None}
    result = provider.chat(db, payload.message, budget, category, context)
    session_id = payload.session_id or uuid.uuid4().hex
    conversation = None
    if user is not None:
        conversation = db.scalar(
            select(AIConversation).where(
                AIConversation.user_id == user.id,
                AIConversation.session_id == session_id,
            )
        )
        if conversation is None:
            conversation = AIConversation(
                user_id=user.id,
                session_id=session_id,
                title=payload.message[:180],
                context={"personal_context_used": payload.use_personal_context},
            )
            db.add(conversation)
            db.flush()
        else:
            conversation.context = {
                **(conversation.context or {}),
                "personal_context_used": payload.use_personal_context,
            }
            conversation.updated_at = datetime.now(timezone.utc)
        db.add(
            AIMessage(
                conversation_id=conversation.id,
                role="user",
                content=payload.message,
                meta={"budget": str(budget) if budget else None, "category": category},
            )
        )
        db.add(
            AIMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=result.get("reply", ""),
                meta={
                    "provider": result.get("provider"),
                    "recommendations": result.get("recommendations", []),
                    "personal_context_used": payload.use_personal_context,
                },
            )
        )
    db.add(
        AnalyticsEvent(
            user_id=user.id if user else None,
            session_id=session_id,
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
        "session_id": session_id,
        "conversation_id": conversation.id if conversation else None,
        "personal_context": context,
        "persistence_note": (
            "Conversation history is stored for your account until you delete it."
            if conversation
            else "Sign in to save conversation history."
        ),
    }


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversations = db.scalars(
        select(AIConversation)
        .where(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
    ).all()
    return {
        "items": [
            {
                "id": conversation.id,
                "session_id": conversation.session_id,
                "title": conversation.title,
                "created_at": conversation.created_at.isoformat(),
                "updated_at": conversation.updated_at.isoformat(),
            }
            for conversation in conversations
        ]
    }


@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.get(AIConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = db.scalars(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation.id)
        .order_by(AIMessage.id.asc())
    ).all()
    return {
        "id": conversation.id,
        "session_id": conversation.session_id,
        "title": conversation.title,
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "meta": message.meta,
                "created_at": message.created_at.isoformat(),
            }
            for message in messages
        ],
    }


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.get(AIConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    for message in db.scalars(
        select(AIMessage).where(AIMessage.conversation_id == conversation.id)
    ).all():
        db.delete(message)
    db.delete(conversation)
    db.commit()
    return {"status": "deleted", "id": conversation_id}


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

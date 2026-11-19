from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import (
    PriceAlert,
    Purchase,
    RecurringPurchase,
    ShoppingMemory,
    User,
    Watchlist,
)
from app.schemas import MemoryUpsert
from app.services.serializers import money

router = APIRouter(prefix="/api/memory", tags=["Personal shopping memory"])


def _payload(memory: ShoppingMemory) -> dict:
    return {
        "id": memory.id,
        "memory_type": memory.memory_type,
        "memory_key": memory.memory_key,
        "memory_value": memory.memory_value,
        "context": memory.context,
        "source": memory.source,
        "consent": memory.consent,
        "expires_at": memory.expires_at.isoformat() if memory.expires_at else None,
        "created_at": memory.created_at.isoformat(),
        "updated_at": memory.updated_at.isoformat(),
    }


@router.get("")
def list_memory(
    memory_type: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(ShoppingMemory).where(ShoppingMemory.user_id == user.id)
    if memory_type:
        query = query.where(ShoppingMemory.memory_type == memory_type)
    items = db.scalars(query.order_by(ShoppingMemory.updated_at.desc())).all()
    return {
        "items": [_payload(item) for item in items],
        "total": len(items),
        "note": "Shopping memory is user-controlled. Delete individual entries or clear all memory at any time.",
    }


@router.post("", status_code=201)
def upsert_memory(
    payload: MemoryUpsert,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = payload.memory_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Memory key is required")
    memory = db.scalar(
        select(ShoppingMemory).where(
            ShoppingMemory.user_id == user.id,
            ShoppingMemory.memory_type == payload.memory_type,
            ShoppingMemory.memory_key == key,
        )
    )
    created = memory is None
    if memory is None:
        memory = ShoppingMemory(
            user_id=user.id,
            memory_type=payload.memory_type,
            memory_key=key,
        )
        db.add(memory)
    memory.memory_value = payload.memory_value
    memory.context = payload.context
    memory.consent = payload.consent
    memory.source = "explicit"
    db.commit()
    db.refresh(memory)
    return {**_payload(memory), "created": created}


@router.delete("/{memory_id}")
def delete_memory(
    memory_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memory = db.get(ShoppingMemory, memory_id)
    if memory is None or memory.user_id != user.id:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    db.delete(memory)
    db.commit()
    return {"status": "deleted", "id": memory_id}


@router.delete("")
def clear_memory(
    confirm: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to clear all shopping memory")
    for memory in db.scalars(select(ShoppingMemory).where(ShoppingMemory.user_id == user.id)).all():
        db.delete(memory)
    db.commit()
    return {"status": "cleared"}


@router.get("/context")
def memory_context(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    memories = db.scalars(
        select(ShoppingMemory).where(
            ShoppingMemory.user_id == user.id,
            ShoppingMemory.consent.is_(True),
        )
    ).all()
    alert_count = len(
        [
            alert
            for alert in db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id)).all()
            if alert.status != "deleted"
        ]
    )
    watchlist = db.scalars(select(Watchlist).where(Watchlist.user_id == user.id)).all()
    purchases = db.scalars(select(Purchase).where(Purchase.user_id == user.id)).all()
    recurring = db.scalars(
        select(RecurringPurchase).where(
            RecurringPurchase.user_id == user.id,
            RecurringPurchase.active.is_(True),
        )
    ).all()
    expired = [
        memory
        for memory in memories
        if memory.expires_at is not None
        and (memory.expires_at if memory.expires_at.tzinfo else memory.expires_at.replace(tzinfo=timezone.utc))
        < datetime.now(timezone.utc)
    ]
    active = [memory for memory in memories if memory not in expired]
    return {
        "memories": [_payload(memory) for memory in active],
        "counts": {
            "memory_entries": len(active),
            "saved_products": len(watchlist),
            "active_alerts": alert_count,
            "purchases": len(purchases),
            "recurring_purchases": len(recurring),
        },
        "spend_tracked": money(sum((purchase.price for purchase in purchases), 0)),
        "consent_note": "Only memories with consent=true are included in Copilot context.",
    }

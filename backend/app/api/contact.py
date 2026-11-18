from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_optional_user
from app.models import AnalyticsEvent, User
from app.schemas import ContactRequest

router = APIRouter(tags=["Contact"])


@router.post("/api/contact", status_code=201)
def contact(
    payload: ContactRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    event = AnalyticsEvent(
        user_id=user.id if user else None,
        event_type="contact_message",
        meta={
            "name": payload.name,
            "email": payload.email,
            "subject": payload.subject,
            "message": payload.message,
        },
    )
    db.add(event)
    db.commit()
    return {
        "status": "received",
        "id": event.id,
        "note": "Your message was stored for review. No external email delivery is claimed in demo mode.",
    }

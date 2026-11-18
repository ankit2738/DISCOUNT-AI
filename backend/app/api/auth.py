from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Preference, User, UserProfile
from app.schemas import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    EmailVerifyRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    PreferenceUpdate,
    ProfileUpdate,
    RegisterRequest,
)
from app.security import create_access_token, hash_password, new_token, verify_password
from app.services.audit import record_audit
from app.services.serializers import money

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def user_payload(user: User) -> dict:
    preferences = user.preferences
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "created_at": user.created_at.isoformat(),
        "profile": {
            "city": user.profile.city if user.profile else None,
            "state": user.profile.state if user.profile else None,
            "pincode": user.profile.pincode if user.profile else None,
            "shopping_persona": user.profile.shopping_persona if user.profile else None,
        },
        "preferences": {
            "preferred_brands": preferences.preferred_brands if preferences else [],
            "categories": preferences.categories if preferences else [],
            "preferred_retailers": preferences.preferred_retailers if preferences else [],
            "budget_min": money(preferences.budget_min) if preferences else None,
            "budget_max": money(preferences.budget_max) if preferences else None,
            "personalization_enabled": preferences.personalization_enabled if preferences else False,
            "notify_in_app": preferences.notify_in_app if preferences else True,
            "notify_email": preferences.notify_email if preferences else False,
            "notify_push": preferences.notify_push if preferences else False,
            "notify_telegram": preferences.notify_telegram if preferences else False,
            "notify_whatsapp": preferences.notify_whatsapp if preferences else False,
            "telegram_configured": bool(preferences.telegram_chat_id) if preferences else False,
            "whatsapp_configured": bool(preferences.whatsapp_number) if preferences else False,
            "consent_analytics": preferences.consent_analytics if preferences else False,
            "consent_marketing": preferences.consent_marketing if preferences else False,
        },
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="user",
        is_verified=False,
        verification_token=new_token(),
    )
    db.add(user)
    db.flush()
    user.profile = UserProfile()
    user.preferences = Preference()
    record_audit(db, user.id, "auth.register", "user", user.id, ip_address=request.client.host if request.client else None)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id), user.role)
    response = {
        "access_token": token,
        "token_type": "bearer",
        "user": user_payload(user),
        "message": "Account created. Email verification is required for full access.",
    }
    if settings.demo_mode:
        response["demo_verification_token"] = user.verification_token
        response["note"] = "Demo mode: no real verification email was sent."
    return response


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=403, detail="Account is inactive")
    user.last_login_at = datetime.now(timezone.utc)
    record_audit(db, user.id, "auth.login", "user", user.id, ip_address=request.client.host if request.client else None)
    db.commit()
    return {
        "access_token": create_access_token(str(user.id), user.role),
        "token_type": "bearer",
        "user": user_payload(user),
    }


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_payload(user)


@router.post("/verify-email")
def verify_email(payload: EmailVerifyRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.verification_token == payload.token))
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    user.is_verified = True
    user.verification_token = None
    db.commit()
    return {"status": "verified"}


@router.post("/request-password-reset")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    response = {"message": "If the account exists, a reset link has been generated."}
    if user is not None:
        user.reset_token = new_token()
        user.reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.commit()
        if settings.demo_mode:
            response["demo_reset_token"] = user.reset_token
            response["note"] = "Demo mode: no email was sent and the token is returned for testing."
    return response


@router.post("/reset-password")
def reset_password(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.reset_token == payload.token))
    if user is None or user.reset_expires_at is None:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    expires = user.reset_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")
    user.password_hash = hash_password(payload.new_password)
    user.reset_token = None
    user.reset_expires_at = None
    db.commit()
    return {"status": "password_reset"}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "password_changed"}


@router.get("/preferences")
def get_preferences(user: User = Depends(get_current_user)):
    return user_payload(user)["preferences"]


@router.put("/preferences")
def update_preferences(
    payload: PreferenceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preferences = user.preferences
    if preferences is None:
        preferences = Preference(user_id=user.id)
        db.add(preferences)
        db.flush()
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(preferences, field, value)
    db.commit()
    db.refresh(user)
    return user_payload(user)["preferences"]


@router.put("/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    profile = user.profile
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
        db.flush()
    for field in ("city", "state", "pincode", "shopping_persona"):
        value = getattr(payload, field)
        if value is not None:
            setattr(profile, field, value)
    db.commit()
    db.refresh(user)
    return user_payload(user)


@router.delete("/account")
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    record_audit(
        db,
        user.id,
        "auth.account_delete",
        "user",
        user.id,
        after={"deleted": True},
        ip_address=request.client.host if request.client else None,
    )
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    user.email = f"deleted-{user.id}-{new_token()[:12]}@invalid.local"
    user.verification_token = None
    user.reset_token = None
    db.commit()
    return {"status": "account_deleted", "note": "Analytics events are retained only in de-identified form."}


@router.post("/logout")
def logout():
    return {"status": "logged_out", "note": "JWT sessions are stateless; discard the token client-side."}

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    raw = hashlib.sha256(f"discount-ai-coupon::{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def normalize_code(code: str) -> str:
    return "".join(code.split()).upper()


def encrypt_coupon_code(code: str) -> str:
    return _fernet().encrypt(normalize_code(code).encode()).decode()


def decrypt_coupon_code(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:  # pragma: no cover - only with wrong/rotated key
        raise ValueError("Coupon code could not be decrypted with the configured key") from exc


def coupon_fingerprint(code: str, retailer_id: int | None) -> str:
    normalized = normalize_code(code)
    scope = str(retailer_id) if retailer_id is not None else "any"
    return hmac.new(
        settings.secret_key.encode(), f"{scope}:{normalized}".encode(), hashlib.sha256
    ).hexdigest()


def masked_code(code: str) -> str:
    normalized = normalize_code(code)
    if len(normalized) <= 4:
        return "*" * len(normalized)
    return f"{normalized[:2]}{'*' * max(4, len(normalized) - 4)}{normalized[-2:]}"


def audit_meta(*, code_present: bool, voter: Any = None) -> dict[str, Any]:
    meta: dict[str, Any] = {"code_present": code_present}
    if voter is not None:
        meta["actor_id"] = getattr(voter, "id", None)
    return meta

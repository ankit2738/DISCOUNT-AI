from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_register_verify_login_and_preferences(client: TestClient) -> None:
    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    register = client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongPass123!", "full_name": "Test Shopper"},
    )
    assert register.status_code == 201, register.text
    body = register.json()
    assert body["user"]["is_verified"] is False
    token = body["demo_verification_token"]
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == email

    verified = client.post("/api/auth/verify-email", json={"token": token})
    assert verified.status_code == 200

    update = client.put(
        "/api/auth/preferences",
        headers=headers,
        json={"preferred_brands": ["Sony"], "budget_max": 50000, "consent_marketing": True},
    )
    assert update.status_code == 200
    assert update.json()["preferred_brands"] == ["Sony"]
    assert update.json()["budget_max"] == 50000.0
    assert update.json()["consent_marketing"] is True

    profile = client.put(
        "/api/auth/profile",
        headers=headers,
        json={"city": "Pune", "shopping_persona": "Researcher"},
    )
    assert profile.status_code == 200
    assert profile.json()["profile"]["city"] == "Pune"


def test_login_rejects_bad_password(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "demo@discountai.in", "password": "wrong"})
    assert response.status_code == 401


def test_duplicate_registration_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"email": "demo@discountai.in", "password": "StrongPass123!", "full_name": "Dup"},
    )
    assert response.status_code == 409


def test_password_reset_flow(client: TestClient) -> None:
    email = f"reset-{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "OldPass123!", "full_name": "Reset User"},
    )
    reset = client.post("/api/auth/request-password-reset", json={"email": email})
    assert reset.status_code == 200
    token = reset.json()["demo_reset_token"]
    confirm = client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "NewPass123!"},
    )
    assert confirm.status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": "NewPass123!"})
    assert login.status_code == 200


def test_change_password_and_delete_account(client: TestClient) -> None:
    email = f"delete-{uuid.uuid4().hex[:8]}@example.com"
    register = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Delete Me"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    changed = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "Password123!", "new_password": "Password456!"},
    )
    assert changed.status_code == 200
    deleted = client.request("DELETE", "/api/auth/account", headers=headers, json={"password": "Password456!"})
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "account_deleted"
    login = client.post("/api/auth/login", json={"email": email, "password": "Password456!"})
    assert login.status_code == 401


def test_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/cart").status_code == 401

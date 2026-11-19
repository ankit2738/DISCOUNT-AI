from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_warranty_records_are_private_to_owner(
    client: TestClient, demo_headers, seller_headers
) -> None:
    product = client.get("/api/products/search", params={"q": "sony"}).json()["items"][0]
    detail = client.get(f"/api/products/{product['id']}").json()
    listing = detail["listings"][0]
    created = client.post(
        "/api/warranty",
        headers=demo_headers,
        json={
            "product_id": product["id"],
            "retailer_id": listing["retailer"]["id"],
            "variant_id": listing["variant_id"],
            "warranty_months": 12,
            "provider": "Demo Warranty Provider",
            "coverage": "Test coverage",
        },
    )
    assert created.status_code == 201, created.text
    record_id = created.json()["id"]

    seller_records = client.get("/api/warranty", headers=seller_headers)
    assert seller_records.status_code == 200
    assert all(item["id"] != record_id for item in seller_records.json()["items"])

    public_records = client.get("/api/warranty/compare", params={"product_id": product["id"]})
    assert public_records.status_code == 200
    assert all(item["id"] != record_id for item in public_records.json()["warranty_records"])


def test_seller_approval_updates_user_role(client: TestClient, admin_headers) -> None:
    email = f"seller-role-{uuid.uuid4().hex[:8]}@example.com"
    register = client.post(
        "/api/auth/register",
        json={"email": email, "password": "StrongPass123!", "full_name": "Role Test Seller"},
    )
    assert register.status_code == 201, register.text
    user_id = register.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    applied = client.post(
        "/api/marketplace/seller/apply",
        headers=headers,
        json={"display_name": "Role Test Seller", "bio": "Testing role updates"},
    )
    assert applied.status_code == 201, applied.text
    seller_id = applied.json()["id"]

    approved = client.patch(
        f"/api/admin/marketplace/sellers/{seller_id}",
        headers=admin_headers,
        json={"status": "approved", "note": "Approved in test"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["user_id"] == user_id
    assert approved.json()["user_role"] == "seller"
    assert approved.json()["role_updated"] is True

    rejected = client.patch(
        f"/api/admin/marketplace/sellers/{seller_id}",
        headers=admin_headers,
        json={"status": "rejected", "note": "Rejected in test"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["user_role"] == "user"
    assert rejected.json()["role_updated"] is True

from __future__ import annotations

from fastapi.testclient import TestClient


def test_marketplace_listings_and_seller_profile(
    client: TestClient, seller_headers
) -> None:
    listings = client.get("/api/marketplace/listings").json()
    assert listings["items"]
    assert all(item["status"] == "approved" for item in listings["items"])

    me = client.get("/api/marketplace/seller/me", headers=seller_headers)
    assert me.status_code == 200
    payload = me.json()
    assert payload["seller"]["status"] == "approved"
    assert payload["earnings_sandbox"] >= 0


def test_sandbox_order_dispute_and_refund(
    client: TestClient, demo_headers, seller_headers, admin_headers
) -> None:
    listings = client.get("/api/marketplace/listings").json()["items"]
    listing = next(item for item in listings if item["is_transfer_allowed"])
    listing_id = listing["id"]

    card_attempt = client.post(
        "/api/marketplace/orders",
        headers=demo_headers,
        json={"listing_id": listing_id, "delivery_details": {"card_number": "4111111111111111"}},
    )
    assert card_attempt.status_code == 400

    order = client.post(
        "/api/marketplace/orders",
        headers=demo_headers,
        json={"listing_id": listing_id, "delivery_details": {"email": "demo@discountai.in"}},
    )
    assert order.status_code == 201, order.text
    payload = order.json()
    assert payload["status"] == "paid_sandbox"
    assert payload["payment_provider"] == "sandbox"
    assert payload["transaction_reference"].startswith("sbx_")

    own_sale = client.post(
        "/api/marketplace/orders",
        headers=seller_headers,
        json={"listing_id": listing_id},
    )
    assert own_sale.status_code in {400, 404}

    dispute = client.post(
        "/api/marketplace/disputes",
        headers=demo_headers,
        json={"order_id": payload["id"], "reason": "Demo dispute for sandbox refund workflow."},
    )
    assert dispute.status_code == 201
    dispute_id = dispute.json()["id"]

    resolved = client.post(
        f"/api/admin/marketplace/disputes/{dispute_id}/resolve",
        headers=admin_headers,
        json={"status": "resolved_refunded", "resolution": "Sandbox refund approved."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved_refunded"

    orders = client.get("/api/marketplace/orders", headers=demo_headers).json()["items"]
    order_payload = next(item for item in orders if item["id"] == payload["id"])
    assert order_payload["status"] == "refunded"


def test_seller_application_requires_admin_approval(client: TestClient, demo_headers) -> None:
    response = client.post(
        "/api/marketplace/seller/apply",
        headers=demo_headers,
        json={"display_name": "Demo Shopper Seller", "bio": "Test application"},
    )
    assert response.status_code in {201, 409}
    if response.status_code == 201:
        assert response.json()["status"] == "pending"

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def _register(client: TestClient) -> dict[str, str]:
    email = f"buyer-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "BuyerPass123!", "full_name": "Feature Buyer"},
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_listing(client, seller_headers, code: str, days: int = 20) -> dict:
    response = client.post(
        "/api/marketplace/listings",
        headers=seller_headers,
        json={
            "title": "Feature coupon listing",
            "description": "Transferable sandbox coupon for feature verification.",
            "category": "coupon",
            "price": 120,
            "coupon_code": code,
            "coupon_value": 400,
            "min_order": 500,
            "brand": "FeatureBrand",
            "proof_url": "https://example.com/feature-proof",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
            "is_transfer_allowed": True,
            "usage_restrictions": "One use per account.",
            "redemption_instructions": "Apply the code at sandbox checkout.",
            "issuer_terms": "Issuer permits transfer for demo purposes.",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_listing_code_is_encrypted_and_duplicates_rejected(client, seller_headers, admin_headers) -> None:
    code = f"FEAT-{uuid.uuid4().hex[:8].upper()}"
    listing = _create_listing(client, seller_headers, code)
    assert listing["status"] == "pending"
    assert "code" not in listing
    assert listing["coupon_code_masked"]
    assert "*" in listing["coupon_code_masked"]

    duplicate = client.post(
        "/api/marketplace/listings",
        headers=seller_headers,
        json={
            "title": "Duplicate attempt",
            "price": 100,
            "coupon_code": code,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
            "is_transfer_allowed": True,
        },
    )
    assert duplicate.status_code == 409

    approved = client.patch(
        f"/api/admin/marketplace/listings/{listing['id']}",
        headers=admin_headers,
        json={"status": "approved", "note": "Feature approval"},
    )
    assert approved.status_code == 200, approved.text
    public = client.get(f"/api/marketplace/listings/{listing['id']}").json()
    assert "coupon_code" not in public
    assert "coupon_code_masked" in public
    assert code not in str(public)


def test_purchase_wallet_redeem_review_and_verified_savings(client, seller_headers, admin_headers) -> None:
    buyer = _register(client)
    code = f"WALLET-{uuid.uuid4().hex[:8].upper()}"
    listing = _create_listing(client, seller_headers, code, days=6)
    client.patch(
        f"/api/admin/marketplace/listings/{listing['id']}",
        headers=admin_headers,
        json={"status": "approved", "note": "Wallet test"},
    )
    order = client.post(
        "/api/marketplace/orders",
        headers=buyer,
        json={"listing_id": listing["id"], "delivery_details": {"email": "buyer@example.com"}, "idempotency_key": f"wallet-{uuid.uuid4().hex}"},
    )
    assert order.status_code == 201, order.text
    order_id = order.json()["id"]
    assert "code" not in order.json()

    wallet = client.get("/api/marketplace/wallet", headers=buyer)
    assert wallet.status_code == 200, wallet.text
    item = next(entry for entry in wallet.json()["items"] if entry["order_id"] == order_id)
    assert item["code"] == code

    forbidden = client.get(f"/api/marketplace/orders/{order_id}/coupon", headers=seller_headers)
    assert forbidden.status_code == 403

    reveal = client.get(f"/api/marketplace/orders/{order_id}/coupon", headers=buyer)
    assert reveal.status_code == 200
    assert reveal.json()["code"] == code

    redeemed = client.post(f"/api/marketplace/orders/{order_id}/redeem", headers=buyer)
    assert redeemed.status_code == 200
    assert redeemed.json()["redemption_status"] == "redeemed"

    review = client.post(
        "/api/marketplace/reviews",
        headers=buyer,
        json={"order_id": order_id, "rating": 5, "comment": "Code delivered correctly."},
    )
    assert review.status_code == 201, review.text
    duplicate = client.post(
        "/api/marketplace/reviews",
        headers=buyer,
        json={"order_id": order_id, "rating": 4},
    )
    assert duplicate.status_code == 409

    savings = client.get("/api/account/savings", headers=buyer)
    assert savings.status_code == 200, savings.text
    body = savings.json()
    assert body["coupons_purchased"] >= 1
    assert body["coupons_redeemed"] >= 1
    assert body["verified_savings"] > 0
    assert body["estimated_savings"] >= body["verified_savings"]

    reminder = client.post("/api/marketplace/reminders/expiry", headers=buyer)
    assert reminder.status_code == 200
    assert reminder.json()["created"] >= 0

    code2 = f"EXPIRY-{uuid.uuid4().hex[:8].upper()}"
    listing2 = _create_listing(client, seller_headers, code2, days=4)
    client.patch(
        f"/api/admin/marketplace/listings/{listing2['id']}",
        headers=admin_headers,
        json={"status": "approved", "note": "Expiry reminder test"},
    )
    order2 = client.post(
        "/api/marketplace/orders",
        headers=buyer,
        json={"listing_id": listing2["id"], "idempotency_key": f"expiry-{uuid.uuid4().hex}"},
    )
    assert order2.status_code == 201, order2.text
    reminder2 = client.post("/api/marketplace/reminders/expiry", headers=buyer)
    assert reminder2.json()["created"] >= 1
    again = client.post("/api/marketplace/reminders/expiry", headers=buyer)
    assert again.json()["created"] == 0


def test_coupon_matcher_and_better_deal(client, admin_headers) -> None:
    search = client.get("/api/products/search", params={"q": "iphone 15 128GB"}).json()
    product_id = search["items"][0]["id"]
    comparison = client.get("/api/comparison", params={"product_id": product_id}).json()
    listing_id = comparison["cheapest_listing_id"]

    match = client.post(
        "/api/coupons/match",
        json={"items": [{"listing_id": listing_id, "amount": 69999, "quantity": 1}]},
    )
    assert match.status_code == 200, match.text
    payload = match.json()
    assert payload["items"][0]["candidates"]
    best = payload["items"][0]["best"]
    assert best["net_saving"] >= 0
    marketplace_candidates = [candidate for candidate in payload["items"][0]["candidates"] if candidate["source"] == "marketplace_listing"]
    assert all("code" not in candidate for candidate in marketplace_candidates)

    deal = client.get(f"/api/better-deal/{listing_id}")
    assert deal.status_code == 200, deal.text
    body = deal.json()
    assert body["options"]
    assert body["lowest_valid_final_price"] is not None
    assert body["recommended"]["type"] in {"direct_purchase", "marketplace_coupon"}


def test_report_resolution_suspends_invalid_coupon(client, seller_headers, admin_headers) -> None:
    buyer = _register(client)
    code = f"REPORT-{uuid.uuid4().hex[:8].upper()}"
    listing = _create_listing(client, seller_headers, code)
    client.patch(
        f"/api/admin/marketplace/listings/{listing['id']}",
        headers=admin_headers,
        json={"status": "approved", "note": "Report test"},
    )
    report = client.post(
        "/api/marketplace/reports",
        headers=buyer,
        json={"listing_id": listing["id"], "reason": "Coupon code was already used when tested."},
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]
    resolved = client.post(
        f"/api/admin/marketplace/reports/{report_id}/resolve",
        headers=admin_headers,
        json={"status": "resolved_invalid", "resolution": "Verified invalid and suspended."},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["listing_status"] == "suspended"

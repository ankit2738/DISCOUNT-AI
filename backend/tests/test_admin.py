from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_admin_requires_admin_role(client: TestClient, demo_headers) -> None:
    assert client.get("/api/admin/overview", headers=demo_headers).status_code == 403
    assert client.get("/api/analytics/metrics", headers=demo_headers).status_code == 403


def test_admin_overview_and_health(client: TestClient, admin_headers) -> None:
    overview = client.get("/api/admin/overview", headers=admin_headers)
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["counts"]["products"] >= 12
    assert payload["metrics"]["primary_metric"]["name"] == "cheaper_store_click_through_rate"

    health = client.get("/api/admin/health", headers=admin_headers)
    assert health.status_code == 200
    assert health.json()["database"]["status"] == "connected"

    users = client.get("/api/admin/users", headers=admin_headers).json()
    emails = {user["email"] for user in users["items"]}
    assert {"demo@discountai.in", "admin@discountai.in", "seller@discountai.in"} <= emails


def test_admin_product_variant_listing_lifecycle(client: TestClient, admin_headers) -> None:
    unique = uuid.uuid4().hex[:6]
    product = client.post(
        "/api/admin/products",
        headers=admin_headers,
        json={
            "name": f"Test Speaker {unique}",
            "brand": "TestBrand",
            "model": f"TS-{unique}",
            "category": "Audio",
            "description": "Admin-created test product.",
            "specs": {"battery": "10 hours"},
        },
    )
    assert product.status_code == 201, product.text
    product_id = product.json()["id"]

    variant = client.post(
        f"/api/admin/products/{product_id}/variants",
        headers=admin_headers,
        json={"sku": f"TS-{unique}-BLK", "variant_name": "Black", "attributes": {"color": "Black"}},
    )
    assert variant.status_code == 201, variant.text
    variant_id = variant.json()["id"]

    listing = client.post(
        "/api/admin/listings",
        headers=admin_headers,
        json={
            "product_id": product_id,
            "variant_id": variant_id,
            "retailer_id": 1,
            "external_id": f"TEST-{unique}",
            "title": "Test Speaker Black",
            "url": "https://example.com/test-speaker",
            "price": 2499,
            "mrp": 3999,
            "delivery_charge": 49,
            "availability": "in_stock",
            "rating": 4.2,
            "seller_name": "Test Seller",
        },
    )
    assert listing.status_code == 201, listing.text
    listing_id = listing.json()["id"]

    updated = client.patch(
        f"/api/admin/listings/{listing_id}/price",
        headers=admin_headers,
        json={"price": 2299, "availability": "limited"},
    )
    assert updated.status_code == 200
    assert updated.json()["price"] == 2299.0

    detail = client.get(f"/api/products/{product_id}")
    assert detail.status_code == 200
    assert detail.json()["listings"][0]["price"] == 2299.0

    deleted = client.delete(f"/api/admin/products/{product_id}", headers=admin_headers)
    assert deleted.status_code == 200


def test_admin_coupon_and_bank_offer_management(client: TestClient, admin_headers) -> None:
    unique = uuid.uuid4().hex[:6].upper()
    coupon = client.post(
        "/api/admin/coupons",
        headers=admin_headers,
        json={
            "code": f"TEST{unique}",
            "title": "Admin test coupon",
            "retailer_id": 1,
            "discount_type": "flat",
            "discount_value": 100,
            "min_order": 500,
            "is_verified": False,
        },
    )
    assert coupon.status_code == 201, coupon.text
    coupon_id = coupon.json()["id"]
    assert coupon.json()["is_demo"] is False

    verified = client.patch(
        f"/api/admin/coupons/{coupon_id}/verify", headers=admin_headers, params={"verified": True}
    )
    assert verified.status_code == 200
    assert verified.json()["is_verified"] is True

    offer = client.post(
        "/api/admin/bank-offers",
        headers=admin_headers,
        json={
            "bank_name": "TestBank",
            "card_type": "credit",
            "title": "Test bank instant discount",
            "discount_type": "flat",
            "discount_value": 250,
            "min_transaction": 1000,
        },
    )
    assert offer.status_code == 201, offer.text
    offer_id = offer.json()["id"]
    deactivated = client.patch(
        f"/api/admin/bank-offers/{offer_id}/active", headers=admin_headers, params={"active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False


def test_admin_campaign_crud_and_audit(client: TestClient, admin_headers) -> None:
    slug = f"test-sale-{uuid.uuid4().hex[:6]}"
    created = client.post(
        "/api/admin/campaigns",
        headers=admin_headers,
        json={
            "slug": slug,
            "name": "Test Sale",
            "description": "Admin test campaign",
            "starts_at": "2026-01-01T00:00:00+00:00",
            "ends_at": "2026-01-10T00:00:00+00:00",
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    campaign_id = created.json()["id"]

    updated = client.patch(
        f"/api/admin/campaigns/{campaign_id}",
        headers=admin_headers,
        json={"name": "Updated Test Sale"},
    )
    assert updated.status_code == 200

    bad = client.patch(
        f"/api/admin/campaigns/{campaign_id}",
        headers=admin_headers,
        json={"bogus_field": "nope"},
    )
    assert bad.status_code == 400

    deleted = client.delete(f"/api/admin/campaigns/{campaign_id}", headers=admin_headers)
    assert deleted.status_code == 200

    logs = client.get("/api/admin/audit-logs", headers=admin_headers).json()
    assert logs["items"]
    assert any(log["action"].startswith("admin.") for log in logs["items"])


def test_admin_retailer_update_and_demo_refresh(client: TestClient, admin_headers) -> None:
    retailers = client.get("/api/admin/retailers", headers=admin_headers).json()
    assert len(retailers["items"]) == 6
    assert len(retailers["adapters"]) == 6
    retailer = retailers["items"][0]
    response = client.patch(
        f"/api/admin/retailers/{retailer['id']}",
        headers=admin_headers,
        json={"integration_status": "demo"},
    )
    assert response.status_code == 200
    refresh = client.post(f"/api/admin/retailers/{retailer['slug']}/refresh-demo", headers=admin_headers)
    assert refresh.status_code == 200
    assert refresh.json()["updated_listings"] >= 1

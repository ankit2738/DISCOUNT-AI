from __future__ import annotations

from fastapi.testclient import TestClient


def test_purchases_tracking_and_privacy_export(client: TestClient, demo_headers) -> None:
    listing = client.get("/api/comparison", params={"product_id": 5}).json()["cheapest_listing_id"]
    created = client.post(
        "/api/purchases",
        headers=demo_headers,
        json={"listing_id": listing, "quantity": 1},
    )
    assert created.status_code == 201, created.text
    purchase_id = created.json()["id"]
    assert "does not promise refunds" in created.json()["note"]

    listing_response = client.get("/api/purchases", headers=demo_headers)
    assert listing_response.status_code == 200
    assert any(item["id"] == purchase_id for item in listing_response.json()["items"])

    tracking = client.get(f"/api/purchases/{purchase_id}/tracking", headers=demo_headers)
    assert tracking.status_code == 200
    assert tracking.json()["direction"] in {"cheaper_now", "higher_now", "unchanged"}
    assert "does not guarantee refunds" in tracking.json()["notice"]

    export = client.get("/api/privacy/export", headers=demo_headers)
    assert export.status_code == 200
    assert export.json()["account"]["email"] == "demo@discountai.in"
    assert "notice" in export.json()


def test_recurring_purchases(client: TestClient, demo_headers) -> None:
    created = client.post(
        "/api/recurring-purchases",
        headers=demo_headers,
        json={"product_id": 12, "label": "Air fryer replacement", "interval_days": 60, "last_price": 8499},
    )
    assert created.status_code == 201, created.text
    record_id = created.json()["id"]
    listing = client.get("/api/recurring-purchases", headers=demo_headers)
    assert listing.status_code == 200
    item = next(entry for entry in listing.json()["items"] if entry["id"] == record_id)
    assert item["savings_if_rebought"] is not None
    paused = client.delete(f"/api/recurring-purchases/{record_id}", headers=demo_headers)
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"


def test_watchlist_crud(client: TestClient, demo_headers) -> None:
    added = client.post(
        "/api/watchlist",
        headers=demo_headers,
        json={"product_id": 11, "list_type": "wishlist", "notes": "Buy during sale"},
    )
    assert added.status_code == 201
    item_id = added.json()["id"]
    listing = client.get("/api/watchlist", params={"list_type": "wishlist"}, headers=demo_headers)
    assert listing.status_code == 200
    assert any(entry["product"]["id"] == 11 for entry in listing.json()["items"])
    deleted = client.delete(f"/api/watchlist/{item_id}", headers=demo_headers)
    assert deleted.status_code == 200


def test_warranty_listing(client: TestClient, demo_headers) -> None:
    response = client.get("/api/warranty", headers=demo_headers)
    assert response.status_code == 200
    assert "items" in response.json()

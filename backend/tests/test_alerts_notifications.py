from __future__ import annotations

from fastapi.testclient import TestClient


def test_alert_creation_triggers_notification(client: TestClient, demo_headers, admin_headers, iphone_listing_id: int) -> None:
    product = client.get("/api/products/search", params={"q": "iphone"}).json()["items"][0]
    created = client.post(
        "/api/alerts",
        headers=demo_headers,
        json={"product_id": product["id"], "target_price": 999999, "channel": "in_app"},
    )
    assert created.status_code == 201, created.text
    alert_id = created.json()["id"]
    assert created.json()["status"] == "active"

    check = client.post("/api/alerts/check", headers=admin_headers)
    assert check.status_code == 200
    payload = check.json()
    assert any(item["alert_id"] == alert_id for item in payload["triggered"])

    notifications = client.get("/api/notifications", headers=demo_headers).json()
    assert any(item["type"] == "price_drop" for item in notifications["items"])

    updated = client.patch(f"/api/alerts/{alert_id}", headers=demo_headers, json={"status": "paused"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "paused"

    deleted = client.delete(f"/api/alerts/{alert_id}", headers=demo_headers)
    assert deleted.status_code == 200


def test_alert_requires_ownership(client: TestClient, seller_headers, demo_headers) -> None:
    product = client.get("/api/products/search", params={"q": "sony"}).json()["items"][0]
    created = client.post(
        "/api/alerts",
        headers=demo_headers,
        json={"product_id": product["id"], "target_price": 1000},
    )
    alert_id = created.json()["id"]
    response = client.patch(f"/api/alerts/{alert_id}", headers=seller_headers, json={"status": "paused"})
    assert response.status_code == 404


def test_notification_providers_are_honest(client: TestClient) -> None:
    response = client.get("/api/notifications/providers")
    assert response.status_code == 200
    channels = {item["channel"]: item for item in response.json()["channels"]}
    assert channels["in_app"]["live"] is True
    assert channels["telegram"]["configured"] is False
    assert channels["whatsapp"]["configured"] is False
    assert channels["push"]["live"] is False


def test_unconfigured_telegram_is_skipped(client: TestClient, demo_headers) -> None:
    response = client.post("/api/notifications/test", headers=demo_headers, params={"channel": "telegram"})
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["status"] == "skipped"
    assert result["error"]


def test_in_app_test_notification(client: TestClient, demo_headers) -> None:
    response = client.post("/api/notifications/test", headers=demo_headers, params={"channel": "in_app"})
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "in_app"

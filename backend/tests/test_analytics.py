from __future__ import annotations

from fastapi.testclient import TestClient



def test_analytics_event_consent(client: TestClient, demo_headers) -> None:
    response = client.post(
        "/api/analytics/events",
        headers=demo_headers,
        json={"event_type": "test_event", "session_id": "sess-1", "meta": {"foo": "bar"}},
    )
    assert response.status_code == 201
    assert response.json()["recorded"] is True
    assert response.json()["consent_applied"] is True


def test_personal_analytics_summary(client: TestClient, demo_headers) -> None:
    response = client.get("/api/analytics/summary", headers=demo_headers)
    assert response.status_code == 200
    payload = response.json()
    assert "event_counts" in payload
    assert "saved_products" in payload


def test_affiliate_click_logs_and_redirects(client: TestClient, iphone_listing_id: int) -> None:
    response = client.get(
        f"/api/affiliate/click/{iphone_listing_id}",
        params={"session_id": "test-session", "source_page": "comparison"},
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"].startswith("http")


def test_metrics_include_primary_metric(client: TestClient, admin_headers) -> None:
    response = client.get("/api/analytics/metrics", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["primary_metric"]["name"] == "cheaper_store_click_through_rate"
    assert "value_pct" in payload["primary_metric"]
    assert payload["product_matching_accuracy"] is None
    assert payload["data_freshness_avg_hours"] is not None
    assert "notification_delivery" in payload

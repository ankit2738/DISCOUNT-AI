from __future__ import annotations

from fastapi.testclient import TestClient


def test_product_detail_by_slug_includes_slug(client: TestClient) -> None:
    item = client.get("/api/products/search", params={"q": "iphone 15"}).json()["items"][0]
    response = client.get(f"/api/products/slug/{item['slug']}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["slug"] == item["slug"]
    assert payload["name"] == item["name"]
    assert payload["listings"]


def test_unknown_product_slug_returns_404(client: TestClient) -> None:
    response = client.get("/api/products/slug/does-not-exist")
    assert response.status_code == 404


def test_today_deals_are_ranked_and_explained(client: TestClient) -> None:
    response = client.get("/api/deals", params={"limit": 6})
    assert response.status_code == 200
    payload = response.json()
    assert 1 <= len(payload["items"]) <= 6
    assert payload["methodology"]
    assert payload["is_demo"] is True
    drops = [item["drop_from_average_pct"] for item in payload["items"]]
    assert drops == sorted(drops, reverse=True)
    for item in payload["items"]:
        assert item["product"]["slug"]
        assert item["history_average"] is None or item["history_average"] > 0
        assert 0 <= item["deal_score"]["score"] <= 100


def test_comparison_payload_includes_product_slug(client: TestClient) -> None:
    item = client.get("/api/products/search", params={"q": "iphone 15"}).json()["items"][0]
    payload = client.get("/api/comparison", params={"product_id": item["id"]}).json()
    assert payload["product"]["slug"] == item["slug"]


def test_contact_is_stored_without_claiming_email_delivery(client: TestClient) -> None:
    response = client.post(
        "/api/contact",
        json={
            "name": "Demo Shopper",
            "email": "shopper@example.com",
            "subject": "Price data correction",
            "message": "Please review the demo listing price for this test submission.",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "received"
    assert payload["id"]
    assert "No external email delivery" in payload["note"]


def test_affiliate_click_records_and_redirects(client: TestClient) -> None:
    item = client.get("/api/products/search", params={"q": "iphone 15 128GB"}).json()["items"][0]
    comparison = client.get("/api/comparison", params={"product_id": item["id"]}).json()
    listing = comparison["listings"][0]
    response = client.get(
        f"/api/affiliate/click/{listing['id']}",
        params={"source_page": "comparison", "session_id": comparison["comparison_session_id"]},
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"] == listing["url"]

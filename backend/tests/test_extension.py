from __future__ import annotations

from fastapi.testclient import TestClient


def test_extension_resolves_exact_variant_by_external_id(client: TestClient) -> None:
    response = client.get(
        "/api/extension/resolve",
        params={
            "title": "Apple iPhone 15 (128GB Black)",
            "retailer": "amazon",
            "external_id": "AMAZON-IP15-128-BLK",
            "variant_hint": "128GB Black",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["matched"] is True
    assert payload["match_method"] == "exact_external_id"
    assert payload["product"]["slug"] == "apple-iphone-15"
    assert payload["variant"]["attributes"]["storage"] == "128GB"
    assert payload["listing"] is not None
    assert payload["exact_variant_required"] is True
    assert "different storage" in payload["disclaimer"]
    assert all(
        listing["variant_id"] == payload["variant"]["id"] for listing in payload["listings"]
    )


def test_extension_does_not_match_unrelated_page(client: TestClient) -> None:
    response = client.get(
        "/api/extension/resolve",
        params={"title": "Unrelated kitchen towel set", "retailer": "amazon"},
    )
    assert response.status_code == 200
    assert response.json()["matched"] is False
    assert response.json()["confidence"] == 0


def test_extension_intelligence_returns_evidence(client: TestClient) -> None:
    resolved = client.get(
        "/api/extension/resolve",
        params={
            "title": "Apple iPhone 15 (128GB Black)",
            "retailer": "amazon",
            "external_id": "AMAZON-IP15-128-BLK",
            "variant_hint": "128GB Black",
        },
    ).json()
    listing_id = resolved["listing"]["id"]
    response = client.get("/api/extension/intelligence", params={"listing_id": listing_id})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["listing"]["id"] == listing_id
    assert payload["final_price"] > 0
    assert "deal_score" in payload
    assert "fake_discount" in payload
    assert "buy_or_wait" in payload
    assert payload["price_history"]["points"]
    assert payload["comparison"]
    assert all(item["variant_id"] == payload["variant"]["id"] for item in payload["comparison"])
    assert payload["disclosures"]
    assert payload["tracking"]["requires_auth"] is True


def test_extension_intelligence_missing_listing(client: TestClient) -> None:
    response = client.get("/api/extension/intelligence", params={"listing_id": 999999})
    assert response.status_code == 404

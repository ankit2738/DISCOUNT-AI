from __future__ import annotations

from fastapi.testclient import TestClient


def _iphone_product_id(client: TestClient) -> int:
    response = client.get("/api/products/search", params={"q": "iphone 15"})
    assert response.status_code == 200
    return response.json()["items"][0]["id"]


def test_search_exact_variant_matching(client: TestClient) -> None:
    only_128 = client.get("/api/products/search", params={"q": "iphone 15 128GB"}).json()
    assert only_128["total"] >= 1
    iphone = only_128["items"][0]
    assert iphone["name"] == "Apple iPhone 15"
    assert all("128GB" in variant["name"] for variant in iphone["variants"])

    only_256 = client.get("/api/products/search", params={"q": "iphone 15 256GB"}).json()
    assert only_256["total"] >= 1
    assert all("256GB" in variant["name"] for variant in only_256["items"][0]["variants"])

    assert only_128["items"][0]["id"] == only_256["items"][0]["id"]


def test_search_filters_and_categories(client: TestClient) -> None:
    laptops = client.get("/api/products/search", params={"category": "Laptops", "max_price": 65000}).json()
    assert laptops["total"] >= 2
    for item in laptops["items"]:
        assert item["category"] == "Laptops"
        assert item["lowest_price"] <= 65000

    retailer_filtered = client.get("/api/products/search", params={"q": "iphone", "retailer": "croma"}).json()
    assert retailer_filtered["total"] >= 1

    categories = client.get("/api/products/categories").json()
    names = {item["name"] for item in categories["items"]}
    assert {"Smartphones", "Laptops", "Audio"} <= names


def test_comparison_is_exact_variant_and_sorted(client: TestClient) -> None:
    product_id = _iphone_product_id(client)
    response = client.get("/api/comparison", params={"product_id": product_id})
    assert response.status_code == 200
    payload = response.json()
    variant_id = payload["variant"]["id"]
    assert len(payload["listings"]) >= 2
    assert all(item["variant_id"] == variant_id for item in payload["listings"])
    prices = [item["effective"]["effective_price"] for item in payload["listings"]]
    assert prices == sorted(prices)
    assert payload["lowest_verified_effective_price"] == prices[0]
    assert sum(1 for item in payload["listings"] if item["is_cheapest_effective"]) == 1
    assert payload["comparison_session_id"]


def test_comparison_rejects_wrong_variant(client: TestClient) -> None:
    product_id = _iphone_product_id(client)
    other_product = client.get("/api/products/search", params={"q": "galaxy s24"}).json()["items"][0]
    response = client.get("/api/comparison", params={"product_id": product_id, "variant_id": other_product["variants"][0]["id"]})
    assert response.status_code == 400


def test_price_history_ranges(client: TestClient, iphone_listing_id: int) -> None:
    for days, minimum in [(30, 28), (90, 85), (365, 360)]:
        response = client.get("/api/prices/history", params={"listing_id": iphone_listing_id, "days": days})
        assert response.status_code == 200
        payload = response.json()
        assert payload["days_requested"] == days
        assert len(payload["points"]) >= minimum
        assert payload["min"] <= payload["max"]
        assert payload["average"] is not None
        assert payload["is_demo"] is True
        assert payload["last_verified_at"]

    alias = client.get("/api/price-history", params={"listing_id": iphone_listing_id, "days": 30})
    assert alias.status_code == 200


def test_deal_score_is_explained(client: TestClient, iphone_listing_id: int) -> None:
    response = client.get("/api/deal-score", params={"listing_id": iphone_listing_id})
    assert response.status_code == 200
    payload = response.json()
    assert 0 <= payload["score"] <= 100
    assert payload["grade"] in {"poor", "fair", "good", "excellent"}
    assert len(payload["explanation"]) >= 3
    assert payload["confidence"] >= 30
    assert payload["evidence"]


def test_fake_discount_detects_inflated_mrp(client: TestClient) -> None:
    product_id = _iphone_product_id(client)
    comparison = client.get("/api/comparison", params={"product_id": product_id}).json()
    amazon = next(
        item for item in comparison["listings"] if item["retailer"]["slug"] == "amazon"
    )
    response = client.get("/api/fake-discount", params={"listing_id": amazon["id"]})
    assert response.status_code == 200
    payload = response.json()
    assert payload["risk_level"] in {"medium", "high"}
    assert any(evidence["signal"] == "inflated_mrp" for evidence in payload["evidence"])
    assert "not an accusation" in payload["disclaimer"]


def test_buy_or_wait_has_valid_recommendation(client: TestClient, iphone_listing_id: int) -> None:
    response = client.get("/api/buy-or-wait", params={"listing_id": iphone_listing_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload["recommendation"] in {"buy", "wait", "monitor"}
    assert 0 <= payload["confidence"] <= 100
    assert payload["reasons"]
    assert payload["limitations"]


def test_alternatives_are_same_category(client: TestClient) -> None:
    laptop = client.get("/api/products/search", params={"q": "ideapad slim 5"}).json()["items"][0]
    response = client.get(f"/api/products/{laptop['id']}/alternatives")
    assert response.status_code == 200
    payload = response.json()
    assert payload["alternatives"]
    assert all(item["category"] == "Laptops" for item in payload["alternatives"])


def test_product_detail_and_warranty_comparison(client: TestClient) -> None:
    product = client.get("/api/products/search", params={"q": "iphone"}).json()["items"][0]
    detail = client.get(f"/api/products/{product['id']}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["specifications"]
    assert payload["listings"]
    assert payload["price_range"]["min"] <= payload["price_range"]["max"]

    warranty = client.get("/api/warranty/compare", params={"product_id": product["id"]})
    assert warranty.status_code == 200
    assert warranty.json()["return_policies"]

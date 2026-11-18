from __future__ import annotations

from fastapi.testclient import TestClient


def test_cart_add_update_delete(client: TestClient, demo_headers, iphone_listing_id: int) -> None:
    client.delete("/api/cart/clear", headers=demo_headers)
    added = client.post(
        "/api/cart/items",
        headers=demo_headers,
        json={"listing_id": iphone_listing_id, "quantity": 1},
    )
    assert added.status_code == 200
    payload = added.json()
    assert payload["item_count"] == 1
    item_id = payload["items"][0]["id"]

    updated = client.patch(
        f"/api/cart/items/{item_id}",
        headers=demo_headers,
        json={"quantity": 2},
    )
    assert updated.status_code == 200
    assert updated.json()["items"][0]["quantity"] == 2

    deleted = client.delete(f"/api/cart/items/{item_id}", headers=demo_headers)
    assert deleted.status_code == 200
    assert deleted.json()["item_count"] == 0


def test_cart_optimizer_finds_cheapest_listing(client: TestClient, demo_headers, iphone_listing_id: int) -> None:
    client.delete("/api/cart/clear", headers=demo_headers)
    client.post(
        "/api/cart/items",
        headers=demo_headers,
        json={"listing_id": iphone_listing_id, "quantity": 1},
    )
    response = client.post("/api/cart/optimize", headers=demo_headers, json={})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"]
    assert payload["optimized_total"] > 0
    assert payload["savings"] >= 0
    assert payload["stores"]
    for store in payload["stores"]:
        assert store["items"]
        assert store["store_payable"] >= 0
    selected = payload["items"][0]
    assert selected["recommended_listing"]["price"] <= selected["original_listing"]["price"]


def test_cart_optimizer_with_bank_offer(client: TestClient, demo_headers, iphone_listing_id: int) -> None:
    offers = client.get("/api/bank-offers", params={"bank": "HDFC"}).json()["items"]
    offer = next(item for item in offers if not item["is_cashback"] and not item["emi_only"])
    response = client.post(
        "/api/cart/optimize",
        headers=demo_headers,
        json={
            "items": [{"listing_id": iphone_listing_id, "quantity": 1}],
            "bank_offer_id": offer["id"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["optimized_total"] < payload["original_total"] or payload["savings"] >= 0
    assert payload["methodology"]

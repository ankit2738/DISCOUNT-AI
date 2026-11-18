from __future__ import annotations

from fastapi.testclient import TestClient


def test_coupon_listing_and_copyable_metadata(client: TestClient) -> None:
    response = client.get("/api/coupons", params={"verified_only": True})
    assert response.status_code == 200
    payload = response.json()
    codes = {item["code"] for item in payload["items"]}
    assert {"AMZ10", "FK5", "CROMA500"} <= codes
    amz = next(item for item in payload["items"] if item["code"] == "AMZ10")
    assert amz["discount_value"] == 10.0
    assert amz["max_discount"] == 1500.0
    assert amz["retailer"]["slug"] == "amazon"

    expired = client.get("/api/coupons").json()
    assert "EXPIRED10" not in {item["code"] for item in expired["items"]}
    with_expired = client.get("/api/coupons", params={"include_expired": True}).json()
    assert "EXPIRED10" in {item["code"] for item in with_expired["items"]}


def test_bank_offers(client: TestClient) -> None:
    response = client.get("/api/bank-offers")
    assert response.status_code == 200
    banks = {item["bank_name"] for item in response.json()["items"]}
    assert {"HDFC", "SBI", "ICICI", "Axis", "Kotak"} <= banks


def test_price_calculator_applies_coupon_and_bank(client: TestClient) -> None:
    offers = client.get("/api/bank-offers", params={"bank": "HDFC"}).json()["items"]
    offer = next(item for item in offers if not item["is_cashback"] and not item["emi_only"])
    response = client.post(
        "/api/price-calculator",
        json={
            "price": 69999,
            "delivery_charge": 0,
            "coupon_code": "AMZ10",
            "bank_offer_id": offer["id"],
            "card_type": "credit",
            "retailer_id": 1,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["breakdown"]["coupon_discount"] == 1500.0
    assert payload["breakdown"]["bank_discount"] == 1500.0
    assert payload["breakdown"]["final_payable"] == 69999 - 1500 - 1500
    assert payload["breakdown"]["cashback"] == 0.0
    assert payload["total_savings"] == 3000.0


def test_price_calculator_cashback_is_separate(client: TestClient) -> None:
    offers = client.get("/api/bank-offers", params={"bank": "HDFC"}).json()["items"]
    cashback_offer = next(item for item in offers if item["is_cashback"])
    response = client.post(
        "/api/price-calculator",
        json={"price": 50000, "bank_offer_id": cashback_offer["id"], "card_type": "credit"},
    )
    payload = response.json()
    assert payload["breakdown"]["cashback"] > 0
    assert payload["breakdown"]["bank_discount"] == 0.0
    assert payload["breakdown"]["final_payable"] == 50000.0
    assert any("Cashback" in warning for warning in payload["warnings"])


def test_price_calculator_rejects_expired_coupon(client: TestClient) -> None:
    response = client.post(
        "/api/price-calculator",
        json={"price": 10000, "coupon_code": "EXPIRED10"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["breakdown"]["coupon_discount"] == 0.0
    assert any("expired" in warning.lower() for warning in payload["warnings"])


def test_price_calculator_min_order_not_met(client: TestClient) -> None:
    response = client.post(
        "/api/price-calculator",
        json={"price": 1000, "coupon_code": "AMZ10"},
    )
    payload = response.json()
    assert payload["breakdown"]["coupon_discount"] == 0.0
    assert any("Minimum order" in warning for warning in payload["warnings"])


def test_offers_for_listing(client: TestClient, iphone_listing_id: int) -> None:
    response = client.get("/api/offers", params={"listing_id": iphone_listing_id})
    assert response.status_code == 200
    payload = response.json()
    assert payload["best_coupon"] is not None
    assert payload["coupon_discount"] > 0
    assert payload["effective"]["effective_price"] > 0

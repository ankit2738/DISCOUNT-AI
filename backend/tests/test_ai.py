from __future__ import annotations

from fastapi.testclient import TestClient


def test_ai_chat_is_grounded_and_rule_based(client: TestClient) -> None:
    response = client.post(
        "/api/ai/chat",
        json={"message": "I need a laptop under ₹65,000 for programming and multitasking"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] in {"rule_based_fallback", "fallback_after_provider_error"}
    assert payload["grounded"] is True
    assert payload["detected_budget"] == 65000.0
    assert payload["detected_category"] == "Laptops"
    assert payload["recommendations"]
    for item in payload["recommendations"]:
        assert item["effective_price"] <= 65000
        assert item["listing_id"]
    assert "demo" in payload["reply"].lower()


def test_ai_chat_without_matches_does_not_invent_products(client: TestClient) -> None:
    response = client.post(
        "/api/ai/chat",
        json={"message": "I need a private jet under ₹1000"},
    )
    payload = response.json()
    assert payload["recommendations"] == []
    assert "will not invent" in payload["reply"].lower()


def test_ai_recommendations_endpoint(client: TestClient) -> None:
    response = client.get("/api/ai/recommendations", params={"budget": 3500, "category": "Wearables"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["items"]
    assert all(item["category"] == "Wearables" for item in payload["items"])


def test_ai_providers_reports_fallback(client: TestClient) -> None:
    response = client.get("/api/ai/providers")
    assert response.status_code == 200
    payload = response.json()
    assert payload["fallback"] == "rule_based_fallback"
    assert "external_configured" in payload

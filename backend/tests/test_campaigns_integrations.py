from __future__ import annotations

from fastapi.testclient import TestClient


def test_sale_campaigns_list_and_detail(client: TestClient) -> None:
    response = client.get("/api/sale-campaigns")
    assert response.status_code == 200
    campaigns = response.json()["items"]
    assert len(campaigns) >= 3
    slugs = {campaign["slug"] for campaign in campaigns}
    assert "amazon-great-indian-festival" in slugs

    detail = client.get("/api/sale-campaigns/amazon-great-indian-festival")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["campaign"]["is_demo"] is True
    assert payload["trending_deals"]
    assert payload["coupons"]
    assert payload["authenticity_checks"]
    assert any(check["check"] == "official_dates_verified" for check in payload["authenticity_checks"])


def test_missing_campaign_returns_404(client: TestClient) -> None:
    assert client.get("/api/sale-campaigns/does-not-exist").status_code == 404


def test_integration_status_is_honest(client: TestClient) -> None:
    response = client.get("/api/integrations/status")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["adapters"]) == 6
    assert all(adapter["integration_status"] == "demo" for adapter in payload["adapters"])
    assert payload["payments"]["live"] is False
    assert payload["ai"]["fallback"] == "rule_based_fallback"
    assert payload["demo_mode"] is True

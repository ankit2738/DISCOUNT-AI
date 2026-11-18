from __future__ import annotations

from fastapi.testclient import TestClient


def test_legacy_health_contract(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "discount-ai-backend"}


def test_api_health_reports_database_and_integrations(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"]["status"] == "connected"
    assert payload["demo_mode"] is True
    assert payload["integrations"]["adapters"] == 6
    assert payload["counts"]["products"] >= 10
    assert payload["counts"]["listings"] >= payload["counts"]["products"]
    assert payload["counts"]["retailers"] == 6


def test_root_and_openapi(client: TestClient) -> None:
    assert client.get("/").status_code == 200
    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert len(openapi.json()["paths"]) > 60

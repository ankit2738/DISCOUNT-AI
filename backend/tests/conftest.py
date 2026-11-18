from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

TEST_DIR = Path(tempfile.mkdtemp(prefix="discountai-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DIR / 'test.db'}"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-with-at-least-32-bytes"
os.environ["DEMO_MODE"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["RATE_LIMIT_PER_MINUTE"] = "10000"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def demo_headers(client):
    return _login(client, "demo@discountai.in", "DemoPass123!")


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, "admin@discountai.in", "AdminPass123!")


@pytest.fixture(scope="session")
def seller_headers(client):
    return _login(client, "seller@discountai.in", "SellerPass123!")


@pytest.fixture(scope="session")
def iphone_listing_id(client):
    response = client.get("/api/products/search", params={"q": "iphone 15 128GB"})
    assert response.status_code == 200
    product_id = response.json()["items"][0]["id"]
    comparison = client.get("/api/comparison", params={"product_id": product_id})
    return comparison.json()["cheapest_listing_id"]

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_community_report_duplicate_detection_and_vote(
    client: TestClient, demo_headers, seller_headers, admin_headers
) -> None:
    product = client.get("/api/products/search", params={"q": "sony"}).json()["items"][0]
    claimed = f"₹{uuid.uuid4().int % 90000 + 10000}"
    first = client.post(
        "/api/community/reports",
        headers=demo_headers,
        json={
            "report_type": "price",
            "product_id": product["id"],
            "claimed_value": claimed,
            "evidence_url": "https://example.com/evidence",
            "description": "Found this price in a demo storefront.",
        },
    )
    assert first.status_code == 201, first.text
    report = first.json()
    assert report["status"] == "pending"
    assert report["duplicate_detected"] is False
    assert report["is_official"] is False

    duplicate = client.post(
        "/api/community/reports",
        headers=demo_headers,
        json={"report_type": "price", "product_id": product["id"], "claimed_value": claimed},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["duplicate_detected"] is True
    assert duplicate.json()["duplicate_of_id"] == report["id"]

    own_vote = client.post(
        f"/api/community/reports/{report['id']}/vote", headers=demo_headers, json={"vote": 1}
    )
    assert own_vote.status_code == 400

    pending_vote = client.post(
        f"/api/community/reports/{report['id']}/vote", headers=seller_headers, json={"vote": 1}
    )
    assert pending_vote.status_code == 404

    moderated = client.post(
        f"/api/admin/community/reports/{report['id']}/moderate",
        headers=admin_headers,
        json={"status": "approved", "note": "Verified against demo source."},
    )
    assert moderated.status_code == 200

    vote = client.post(
        f"/api/community/reports/{report['id']}/vote", headers=seller_headers, json={"vote": 1}
    )
    assert vote.status_code == 200
    assert vote.json()["vote"] == 1


def test_admin_moderation_publishes_community_report(client: TestClient, admin_headers) -> None:
    pending = [
        report
        for report in client.get("/api/community/reports", params={"status_filter": "pending"}).json()["items"]
    ]
    assert pending
    report_id = pending[0]["id"]
    moderated = client.post(
        f"/api/admin/community/reports/{report_id}/moderate",
        headers=admin_headers,
        json={"status": "approved", "note": "Verified against demo source."},
    )
    assert moderated.status_code == 200
    public = client.get("/api/community/reports", params={"status_filter": "approved"}).json()
    assert any(item["id"] == report_id for item in public["items"])


def test_leaderboard(client: TestClient) -> None:
    response = client.get("/api/community/leaderboard")
    assert response.status_code == 200
    assert "items" in response.json()

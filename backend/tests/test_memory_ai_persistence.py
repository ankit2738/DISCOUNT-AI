from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def test_memory_crud_consent_and_context(client: TestClient, demo_headers, seller_headers) -> None:
    key = f"test-budget-{uuid.uuid4().hex[:8]}"
    created = client.post(
        "/api/memory",
        headers=demo_headers,
        json={
            "memory_type": "budget",
            "memory_key": key,
            "memory_value": "45000",
            "context": {"source": "test"},
            "consent": True,
        },
    )
    assert created.status_code == 201, created.text
    memory = created.json()
    assert memory["consent"] is True
    assert memory["source"] == "explicit"
    assert memory["created"] is True

    listed = client.get("/api/memory", headers=demo_headers)
    assert listed.status_code == 200
    assert any(item["id"] == memory["id"] for item in listed.json()["items"])

    context = client.get("/api/memory/context", headers=demo_headers)
    assert context.status_code == 200
    assert any(item["memory_key"] == key for item in context.json()["memories"])

    other_user_delete = client.delete(f"/api/memory/{memory['id']}", headers=seller_headers)
    assert other_user_delete.status_code == 404

    updated = client.post(
        "/api/memory",
        headers=demo_headers,
        json={
            "memory_type": "budget",
            "memory_key": key,
            "memory_value": "45000",
            "context": {"source": "test"},
            "consent": False,
        },
    )
    assert updated.status_code == 201
    assert updated.json()["id"] == memory["id"]
    assert updated.json()["created"] is False
    assert updated.json()["consent"] is False

    context_after = client.get("/api/memory/context", headers=demo_headers).json()
    assert all(item["memory_key"] != key for item in context_after["memories"])

    deleted = client.delete(f"/api/memory/{memory['id']}", headers=demo_headers)
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"


def test_clear_memory_requires_confirmation(client: TestClient, demo_headers) -> None:
    unconfirmed = client.delete("/api/memory", headers=demo_headers)
    assert unconfirmed.status_code == 400


def test_ai_conversation_persistence(client: TestClient, demo_headers) -> None:
    session_id = f"test_{uuid.uuid4().hex}"
    chat = client.post(
        "/api/ai/chat",
        headers=demo_headers,
        json={
            "message": "Best phone under 30000 for battery life",
            "session_id": session_id,
            "use_personal_context": True,
        },
    )
    assert chat.status_code == 200, chat.text
    payload = chat.json()
    assert payload["session_id"] == session_id
    assert payload["conversation_id"] is not None
    assert payload["personal_context"]["authenticated"] is True
    assert "Conversation history is stored" in payload["persistence_note"]

    conversations = client.get("/api/ai/conversations", headers=demo_headers)
    assert conversations.status_code == 200
    assert any(item["session_id"] == session_id for item in conversations.json()["items"])

    conversation = client.get(
        f"/api/ai/conversations/{payload['conversation_id']}", headers=demo_headers
    )
    assert conversation.status_code == 200
    messages = conversation.json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert "recommendations" in messages[1]["meta"]

    deleted = client.delete(
        f"/api/ai/conversations/{payload['conversation_id']}", headers=demo_headers
    )
    assert deleted.status_code == 200
    missing = client.get(
        f"/api/ai/conversations/{payload['conversation_id']}", headers=demo_headers
    )
    assert missing.status_code == 404


def test_ai_conversation_is_private(client: TestClient, demo_headers, seller_headers) -> None:
    session_id = f"private_{uuid.uuid4().hex}"
    chat = client.post(
        "/api/ai/chat",
        headers=demo_headers,
        json={"message": "Laptop for college under 60000", "session_id": session_id},
    )
    conversation_id = chat.json()["conversation_id"]
    forbidden = client.get(f"/api/ai/conversations/{conversation_id}", headers=seller_headers)
    assert forbidden.status_code == 404

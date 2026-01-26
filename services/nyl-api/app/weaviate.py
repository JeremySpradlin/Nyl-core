import os
from typing import Any

import httpx

WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://weaviate:8080")
WEAVIATE_TIMEOUT = float(os.getenv("WEAVIATE_TIMEOUT", "30"))
WEAVIATE_JOURNAL_CLASS = "NylJournalEntry"

_weaviate_client: httpx.AsyncClient | None = None
_schema_checked = False


async def startup_weaviate_client() -> None:
    global _weaviate_client
    if _weaviate_client is None:
        _weaviate_client = httpx.AsyncClient(
            base_url=WEAVIATE_URL, timeout=httpx.Timeout(WEAVIATE_TIMEOUT)
        )


async def shutdown_weaviate_client() -> None:
    global _weaviate_client
    if _weaviate_client is not None:
        await _weaviate_client.aclose()
        _weaviate_client = None


def get_weaviate_client() -> httpx.AsyncClient:
    if _weaviate_client is None:
        raise RuntimeError("Weaviate client is not initialized")
    return _weaviate_client


def _escape_graphql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


async def query_journal_entries(
    client: httpx.AsyncClient,
    vector: list[float],
    query_text: str,
    limit: int,
    alpha: float = 0.6,
) -> list[dict[str, Any]]:
    if not vector:
        return []
    vector_str = ", ".join(f"{value:.6f}" for value in vector)
    safe_query = _escape_graphql_string(query_text)
    hybrid_clause = (
        f'hybrid: {{query: "{safe_query}", alpha: {alpha}, vector: [{vector_str}]}}'
    )
    query = (
        "{"
        " Get {"
        f" {WEAVIATE_JOURNAL_CLASS}(limit: {limit}, {hybrid_clause}) {{"
        " source_id"
        " journal_date"
        " title"
        " body_text"
        " _additional { score }"
        " }"
        " }"
        "}"
    )
    response = await client.post("/v1/graphql", json={"query": query})
    response.raise_for_status()
    payload = response.json()
    if payload.get("errors"):
        raise RuntimeError(f"Weaviate query failed: {payload['errors']}")
    return payload.get("data", {}).get("Get", {}).get(WEAVIATE_JOURNAL_CLASS, [])


async def ensure_journal_schema(client: httpx.AsyncClient) -> None:
    global _schema_checked
    if _schema_checked:
        return
    response = await client.get("/v1/schema")
    response.raise_for_status()
    classes = response.json().get("classes", [])
    if any(cls.get("class") == WEAVIATE_JOURNAL_CLASS for cls in classes):
        _schema_checked = True
        return

    payload = {
        "class": WEAVIATE_JOURNAL_CLASS,
        "description": "Journal entries for RAG",
        "vectorizer": "none",
        "properties": [
            {"name": "source_type", "dataType": ["text"]},
            {"name": "source_id", "dataType": ["text"]},
            {"name": "scope", "dataType": ["text"]},
            {"name": "journal_date", "dataType": ["date"]},
            {"name": "created_at", "dataType": ["date"]},
            {"name": "title", "dataType": ["text"]},
            {"name": "body_text", "dataType": ["text"]},
            {"name": "tags", "dataType": ["text[]"]},
            {"name": "content_hash", "dataType": ["text"]},
            {"name": "embedding_model", "dataType": ["text"]},
        ],
    }
    create = await client.post("/v1/schema", json=payload)
    create.raise_for_status()
    _schema_checked = True


async def get_object(
    client: httpx.AsyncClient, object_id: str
) -> dict[str, Any] | None:
    response = await client.get(f"/v1/objects/{WEAVIATE_JOURNAL_CLASS}/{object_id}")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


async def upsert_object(
    client: httpx.AsyncClient,
    object_id: str,
    properties: dict[str, Any],
    vector: list[float],
) -> None:
    payload = {
        "class": WEAVIATE_JOURNAL_CLASS,
        "id": object_id,
        "properties": properties,
        "vector": vector,
    }
    response = await client.post("/v1/objects", json=payload)
    if response.status_code >= 400:
        raise RuntimeError(
            f"Weaviate upsert failed ({response.status_code}): {response.text}"
        )


async def update_object(
    client: httpx.AsyncClient,
    object_id: str,
    properties: dict[str, Any],
    vector: list[float],
) -> None:
    payload = {
        "class": WEAVIATE_JOURNAL_CLASS,
        "id": object_id,
        "properties": properties,
        "vector": vector,
    }
    response = await client.put(
        f"/v1/objects/{WEAVIATE_JOURNAL_CLASS}/{object_id}", json=payload
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Weaviate update failed ({response.status_code}): {response.text}"
        )


async def delete_object(client: httpx.AsyncClient, object_id: str) -> None:
    response = await client.delete(f"/v1/objects/{WEAVIATE_JOURNAL_CLASS}/{object_id}")
    if response.status_code not in (204, 404):
        raise RuntimeError(
            f"Weaviate delete failed ({response.status_code}): {response.text}"
        )

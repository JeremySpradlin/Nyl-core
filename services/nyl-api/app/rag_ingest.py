import asyncio
import hashlib
import logging
import os
from datetime import date, datetime, time, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from .database import SessionLocal
from .models import JournalEntry
from .ollama import embed_text, get_ollama_client
from .rag_db import mark_job_completed, mark_job_failed, mark_job_running, update_job_progress, update_job_total
from .weaviate import (
    delete_object,
    ensure_journal_schema,
    get_object,
    get_weaviate_client,
    upsert_object,
    update_object,
)

LOGGER = logging.getLogger(__name__)

RAG_INGEST_ON_SAVE = os.getenv("RAG_INGEST_ON_SAVE", "true").lower() == "true"
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text:latest")
EMBEDDING_CHUNK_SIZE = int(os.getenv("EMBEDDING_CHUNK_SIZE", "1500"))


def _append_text(chunks: list[str], text: str) -> None:
    if text:
        chunks.append(text)


def _maybe_newline(chunks: list[str]) -> None:
    if not chunks:
        return
    if not chunks[-1].endswith("\n"):
        chunks.append("\n")


def _walk_tiptap(node: dict[str, Any], chunks: list[str]) -> None:
    node_type = node.get("type")
    if node_type == "text":
        _append_text(chunks, node.get("text", ""))
        return
    if node_type == "hardBreak":
        chunks.append("\n")
        return

    for child in node.get("content", []) or []:
        _walk_tiptap(child, chunks)

    if node_type in {
        "paragraph",
        "heading",
        "blockquote",
        "codeBlock",
        "listItem",
    }:
        _maybe_newline(chunks)


def extract_journal_text(body: dict[str, Any] | None) -> str:
    if not body or not isinstance(body, dict):
        return ""
    chunks: list[str] = []
    _walk_tiptap(body, chunks)
    text = "".join(chunks)
    return "\n".join(line.rstrip() for line in text.splitlines()).strip()


def build_content_hash(title: str | None, body_text: str, tags: list[str] | None) -> str:
    payload = "\n".join(
        [
            title or "",
            body_text,
            ",".join(tags or []),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _to_rfc3339(value: date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return datetime.combine(value, time.min, tzinfo=timezone.utc).isoformat()


def _strip_none(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


def _chunk_text(text: str, max_size: int) -> list[str]:
    if not text:
        return []
    paragraphs = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
    chunks: list[str] = []
    buffer: list[str] = []
    size = 0
    for para in paragraphs:
        if len(para) > max_size:
            if buffer:
                chunks.append("\n\n".join(buffer))
                buffer = []
                size = 0
            for start in range(0, len(para), max_size):
                chunks.append(para[start : start + max_size])
            continue
        next_size = size + len(para) + (2 if buffer else 0)
        if next_size > max_size and buffer:
            chunks.append("\n\n".join(buffer))
            buffer = [para]
            size = len(para)
        else:
            buffer.append(para)
            size = next_size
    if buffer:
        chunks.append("\n\n".join(buffer))
    return chunks


def _average_vectors(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []
    length = len(vectors[0])
    totals = [0.0] * length
    for vector in vectors:
        for idx in range(length):
            totals[idx] += vector[idx]
    return [value / len(vectors) for value in totals]


async def ingest_journal_entry(
    entry: dict[str, Any], embedding_model: str | None = None
) -> None:
    model = embedding_model or DEFAULT_EMBEDDING_MODEL
    title = entry.get("title") or ""
    body_text = extract_journal_text(entry.get("body") or {})
    tags = entry.get("tags") or []
    content_hash = build_content_hash(title, body_text, tags)
    object_id = str(entry.get("id"))

    weaviate_client = get_weaviate_client()
    ollama_client = get_ollama_client()
    existing = await get_object(weaviate_client, object_id)
    if not title and not body_text:
        if existing:
            await delete_object(weaviate_client, object_id)
        return

    await ensure_journal_schema(weaviate_client)
    if existing:
        props = existing.get("properties") or {}
        if (
            props.get("content_hash") == content_hash
            and props.get("embedding_model") == model
        ):
            return

    full_text = f"{title}\n\n{body_text}".strip()
    chunks = _chunk_text(full_text, EMBEDDING_CHUNK_SIZE)
    embeddings: list[list[float]] = []
    for chunk in chunks:
        embeddings.append(await embed_text(chunk, model=model, client=ollama_client))
    embedding = _average_vectors(embeddings)
    LOGGER.info(
        "Weaviate embedding length=%s model=%s chunks=%s",
        len(embedding),
        model,
        len(chunks),
    )

    properties = {
        "source_type": "journal",
        "source_id": object_id,
        "scope": entry.get("scope"),
        "journal_date": _to_rfc3339(entry.get("journal_date")),
        "created_at": _to_rfc3339(entry.get("created_at")),
        "title": title or None,
        "body_text": body_text,
        "tags": tags or None,
        "content_hash": content_hash,
        "embedding_model": model,
    }
    cleaned = _strip_none(properties)
    if existing:
        try:
            await update_object(weaviate_client, object_id, cleaned, embedding)
        except RuntimeError as exc:
            if "no object with id" in str(exc):
                await upsert_object(weaviate_client, object_id, cleaned, embedding)
            else:
                raise
    else:
        await upsert_object(weaviate_client, object_id, cleaned, embedding)


def enqueue_ingest(entry: dict[str, Any], embedding_model: str | None = None) -> None:
    if not RAG_INGEST_ON_SAVE:
        return

    async def _runner() -> None:
        try:
            await ingest_journal_entry(entry, embedding_model=embedding_model)
        except Exception:
            LOGGER.exception("Journal ingestion failed")

    asyncio.create_task(_runner())


async def reindex_journal_entries(job_id: UUID, embedding_model: str) -> None:
    async with SessionLocal() as session:
        try:
            await mark_job_running(session, job_id)

            count_result = await session.execute(
                select(func.count()).select_from(JournalEntry)
            )
            total = count_result.scalar_one() or 0
            await update_job_total(session, job_id, total)

            processed = 0
            page_size = 50
            while processed < total:
                entries_result = await session.execute(
                    select(JournalEntry)
                    .order_by(JournalEntry.created_at.asc())
                    .offset(processed)
                    .limit(page_size)
                )
                entries = entries_result.scalars().all()
                if not entries:
                    break
                for entry in entries:
                    await ingest_journal_entry(
                        {
                            "id": entry.id,
                            "created_at": entry.created_at,
                            "journal_date": entry.journal_date,
                            "scope": entry.scope,
                            "title": entry.title,
                            "body": entry.body,
                            "tags": entry.tags,
                        },
                        embedding_model=embedding_model,
                    )
                    processed += 1
                await update_job_progress(session, job_id, processed)

            await mark_job_completed(session, job_id)
        except Exception as exc:
            await mark_job_failed(session, job_id, str(exc))
            LOGGER.exception("RAG reindex failed")

import asyncio
import logging
import os
import time
from typing import Any

from .database import SessionLocal
from .db import search_journal_entries_by_vector
from .journal_text import extract_journal_text
from .ollama import embed_text, get_ollama_client
from .schemas import ChatMessage, ChatRequest, RagConfig

LOGGER = logging.getLogger(__name__)

RAG_TOP_K_DEFAULT = 5
RAG_TOP_K_MAX = 8
RAG_TIMEOUT_SECONDS = float(os.getenv("RAG_RETRIEVAL_TIMEOUT", "1.5"))


def _last_user_message(messages: list[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content.strip():
            return message.content.strip()
    return ""


def _format_date(raw_date: Any) -> str:
    if not raw_date:
        return "unknown-date"
    # Handle both date objects and ISO strings
    if hasattr(raw_date, "isoformat"):
        return raw_date.isoformat()
    return str(raw_date).split("T")[0]


def _excerpt(text: str, max_chars: int = 280) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_chars:
        return normalized
    cutoff = normalized.rfind(" ", 0, max_chars)
    if cutoff < 0:
        cutoff = max_chars
    return f"{normalized[:cutoff].rstrip()}..."


def _build_context_block(results: list[dict[str, Any]]) -> str:
    if not results:
        return (
            "Context:\n"
            "<journal>\n"
            "No relevant journal entries found.\n"
            "</journal>\n"
            "Instructions: Use journal context if it is relevant; otherwise respond normally."
        )

    lines = [
        "Context:",
        "<journal>",
    ]
    for item in results:
        title = item.get("title") or "Untitled"
        journal_date = _format_date(item.get("journal_date"))
        source_id = str(item.get("id") or "unknown-id")
        body_text = extract_journal_text(item.get("body") or {})
        excerpt = _excerpt(body_text)
        lines.append(f"- {journal_date} · {title} (id: {source_id})")
        if excerpt:
            lines.append(f"  Excerpt: {excerpt}")
    lines.extend(
        [
            "</journal>",
            "Instructions: Use journal context if it is relevant; otherwise respond normally.",
        ]
    )
    return "\n".join(lines)


def _inject_context(messages: list[ChatMessage], context_block: str) -> list[ChatMessage]:
    updated: list[ChatMessage] = []
    injected = False
    for message in messages:
        if message.role == "system" and not injected:
            content = message.content.strip()
            combined = f"{content}\n\n{context_block}".strip() if content else context_block
            updated.append(ChatMessage(role="system", content=combined))
            injected = True
        else:
            updated.append(message)
    if not injected:
        updated.insert(0, ChatMessage(role="system", content=context_block))
    return updated


def _resolve_rag_config(rag: RagConfig | None) -> tuple[bool, int, str | None]:
    if rag is None:
        enabled = True
        top_k = RAG_TOP_K_DEFAULT
        embedding_model = None
    else:
        enabled = rag.enabled
        top_k = rag.top_k or RAG_TOP_K_DEFAULT
        embedding_model = rag.embedding_model
    return enabled, min(max(top_k, 1), RAG_TOP_K_MAX), embedding_model


async def apply_rag_context(request: ChatRequest, default_embedding_model: str) -> ChatRequest:
    enabled, top_k, embedding_model = _resolve_rag_config(request.rag)
    if not enabled:
        LOGGER.info("RAG disabled for chat request")
        return request

    query = _last_user_message(request.messages)
    if not query:
        LOGGER.info("RAG skipped: no user message")
        return request

    async def _build_context() -> str:
        ollama_client = get_ollama_client()
        model = embedding_model or default_embedding_model
        embedding = await embed_text(query, model=model, client=ollama_client)

        async with SessionLocal() as session:
            results = await search_journal_entries_by_vector(session, embedding, top_k)

        return _build_context_block(results)

    start = time.perf_counter()
    try:
        context_block = await asyncio.wait_for(_build_context(), RAG_TIMEOUT_SECONDS)
    except Exception:
        LOGGER.exception("RAG retrieval failed, continuing without context")
        return request
    duration_ms = (time.perf_counter() - start) * 1000
    LOGGER.info("RAG context injected (top_k=%s, time_ms=%.1f)", top_k, duration_ms)

    updated_messages = _inject_context(request.messages, context_block)
    return request.model_copy(update={"messages": updated_messages})

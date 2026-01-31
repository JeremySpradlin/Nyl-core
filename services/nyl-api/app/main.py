import asyncio
import os
from datetime import date, date as dt_date

from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_session, shutdown_db, startup_db
from .db import (
    create_journal_entry,
    delete_journal_entry,
    ensure_journal_entry,
    get_journal_entry,
    get_journal_entry_by_date,
    get_journal_task,
    update_journal_entry,
    list_journal_entries,
    list_journal_entry_markers,
    list_journal_scopes,
    list_journal_tasks,
    create_journal_task,
    update_journal_task,
    delete_journal_task,
    restore_journal_entry,
)
from .services import ChatService
from .journal_text import extract_journal_text
from .rag_db import create_ingest_job, get_ingest_job
from .rag_ingest import DEFAULT_EMBEDDING_MODEL, enqueue_ingest, reindex_journal_entries
from .rag_chat import apply_rag_context
from .ollama import (
    chat,
    get_ollama_client,
    is_allowed_chat_model,
    list_models,
    list_embedding_models,
    shutdown_ollama_client,
    startup_ollama_client,
    stream_chat,
)
from .schemas import (
    ChatMessageCreate,
    ChatMessageRecord,
    ChatRequest,
    ChatSession,
    ChatSessionCreate,
    ChatSessionDetail,
    JournalEntry,
    JournalEntryCreate,
    JournalEntryEnsure,
    JournalEntryUpdate,
    JournalEntryMarker,
    JournalTask,
    JournalTaskCreate,
    JournalTaskUpdate,
    RagIngestJob,
    SCOPE_PATTERN,
)

app = FastAPI(title="Nyl API")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    allow_all = "*" in cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else cors_origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
async def startup() -> None:
    await startup_ollama_client()
    await startup_db()


@app.on_event("shutdown")
async def shutdown() -> None:
    await shutdown_ollama_client()
    await shutdown_db()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/models")
async def models(client: httpx.AsyncClient = Depends(get_ollama_client)) -> dict[str, object]:
    return await list_models(client)


@app.get("/v1/models/embeddings")
async def embedding_models(
    client: httpx.AsyncClient = Depends(get_ollama_client),
) -> dict[str, object]:
    return await list_embedding_models(client)


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatRequest,
    client: httpx.AsyncClient = Depends(get_ollama_client),
):
    if not is_allowed_chat_model(request.model):
        raise HTTPException(status_code=400, detail="Model is not allowed for chat")
    request_with_rag = await apply_rag_context(request, DEFAULT_EMBEDDING_MODEL)
    if request.stream:
        return StreamingResponse(
            stream_chat(request_with_rag, client),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    return await chat(request_with_rag, client)


@app.post("/v1/chats", response_model=ChatSession)
async def create_chat(
    request: ChatSessionCreate,
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    return await service.create_session(
        title=request.title,
        model=request.model,
        system_prompt=request.system_prompt,
        scope=request.scope,
    )


@app.get("/v1/chats", response_model=list[ChatSession])
async def list_chats(
    status: str = Query("active"),
    scope: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    if status not in ("active", "archived", "deleted"):
        raise HTTPException(status_code=400, detail="Invalid status filter")
    service = ChatService(session)
    await service.purge_deleted_sessions()
    return await service.list_sessions(status=status, scope=scope, limit=200)


@app.get("/v1/chats/{chat_id:uuid}", response_model=ChatSessionDetail)
async def get_chat(
    chat_id: UUID,
    include_deleted: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    result = await service.get_session_with_messages(chat_id, include_deleted=include_deleted)
    if result is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return result


@app.post("/v1/chats/{chat_id:uuid}/messages", response_model=list[ChatMessageRecord])
async def create_chat_messages(
    chat_id: UUID,
    request: list[ChatMessageCreate],
    model: str | None = Query(default=None),
    system_prompt: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    messages = await service.add_messages(
        chat_id,
        [message.model_dump() for message in request],
        model=model,
        system_prompt=system_prompt,
    )
    if not messages:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return messages


@app.post("/v1/chats/{chat_id:uuid}/archive", response_model=ChatSession)
async def archive_chat(
    chat_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    chat_session = await service.archive_session(chat_id)
    if chat_session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat_session


@app.post("/v1/chats/{chat_id:uuid}/unarchive", response_model=ChatSession)
async def unarchive_chat(
    chat_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    chat_session = await service.unarchive_session(chat_id)
    if chat_session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat_session


@app.delete("/v1/chats/{chat_id:uuid}", response_model=ChatSession)
async def delete_chat(
    chat_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    chat_session = await service.delete_session(chat_id)
    if chat_session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat_session


@app.post("/v1/chats/{chat_id:uuid}/restore", response_model=ChatSession)
async def restore_chat(
    chat_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    service = ChatService(session)
    chat_session = await service.restore_session(chat_id)
    if chat_session is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat_session


@app.post("/v1/journal/entries", response_model=JournalEntry)
async def create_entry(
    request: JournalEntryCreate,
    session: AsyncSession = Depends(get_session),
):
    try:
        entry = await create_journal_entry(
            session=session,
            journal_date=request.journal_date,
            scope=request.scope,
            title=request.title,
            body=request.body,
            tags=request.tags,
        )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409, detail="Journal entry already exists for this day"
        ) from exc
    enqueue_ingest(entry)
    return entry


@app.post("/v1/journal/entries/ensure", response_model=JournalEntry)
async def ensure_entry(
    request: JournalEntryEnsure,
    session: AsyncSession = Depends(get_session),
):
    return await ensure_journal_entry(
        session=session,
        journal_date=request.journal_date,
        scope=request.scope,
        title=request.title,
        body=request.body,
        tags=request.tags,
    )


@app.get("/v1/journal/entries", response_model=list[JournalEntry])
async def list_entries(
    scope: str = Query(..., pattern=SCOPE_PATTERN),
    limit: int = Query(50, ge=1, le=200),
    status: str = Query("active"),
    session: AsyncSession = Depends(get_session),
):
    if status not in ("active", "deleted", "all"):
        raise HTTPException(status_code=400, detail="Invalid status filter")
    return await list_journal_entries(
        session=session, scope=scope, limit=limit, status=status
    )


@app.get("/v1/journal/scopes", response_model=list[str])
async def list_scopes(session: AsyncSession = Depends(get_session)):
    return await list_journal_scopes(session=session)


@app.get("/v1/journal/entries/dates", response_model=list[JournalEntryMarker])
async def list_entry_markers(
    start: date = Query(...),
    end: date = Query(...),
    scope: str | None = Query(default=None, pattern=SCOPE_PATTERN),
    session: AsyncSession = Depends(get_session),
):
    return await list_journal_entry_markers(
        session=session, start_date=start, end_date=end, scope=scope
    )


@app.get("/v1/journal/entries/by-date", response_model=JournalEntry)
async def get_entry_by_date(
    scope: str = Query(..., pattern=SCOPE_PATTERN),
    date_str: str = Query(..., alias="date"),
    include_deleted: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    try:
        journal_date = dt_date.fromisoformat(date_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format") from exc
    entry = await get_journal_entry_by_date(
        session=session,
        scope=scope,
        journal_date=journal_date,
        include_deleted=include_deleted,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@app.get("/v1/journal/entries/{entry_id:uuid}", response_model=JournalEntry)
async def get_entry(
    entry_id: UUID,
    include_deleted: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    entry = await get_journal_entry(session, entry_id, include_deleted=include_deleted)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@app.get("/v1/journal/entries/{entry_id:uuid}/tasks", response_model=list[JournalTask])
async def list_tasks(
    entry_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    entry = await get_journal_entry(session, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return await list_journal_tasks(session=session, entry_id=entry_id)


@app.post("/v1/journal/entries/{entry_id:uuid}/tasks", response_model=JournalTask)
async def create_task(
    entry_id: UUID,
    request: JournalTaskCreate,
    session: AsyncSession = Depends(get_session),
):
    entry = await get_journal_entry(session, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    tasks = await list_journal_tasks(session=session, entry_id=entry_id)
    next_order = request.sort_order if request.sort_order is not None else len(tasks)
    return await create_journal_task(
        session=session, entry_id=entry_id, text=request.text, sort_order=next_order
    )


@app.patch("/v1/journal/tasks/{task_id}", response_model=JournalTask)
async def update_task(
    task_id: UUID,
    request: JournalTaskUpdate,
    session: AsyncSession = Depends(get_session),
):
    fields = request.model_dump(exclude_unset=True)
    if not fields:
        task = await get_journal_task(session=session, task_id=task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Journal task not found")
        return task
    task = await update_journal_task(session=session, task_id=task_id, fields=fields)
    if task is None:
        raise HTTPException(status_code=404, detail="Journal task not found")
    return task


@app.delete("/v1/journal/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    deleted = await delete_journal_task(session, task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Journal task not found")


@app.patch("/v1/journal/entries/{entry_id:uuid}")
async def update_entry(
    entry_id: UUID,
    request: JournalEntryUpdate,
    session: AsyncSession = Depends(get_session),
):
    fields: dict[str, object] = {}
    if "title" in request.model_fields_set:
        fields["title"] = request.title
    if "body" in request.model_fields_set:
        fields["body"] = request.body
    if "tags" in request.model_fields_set:
        fields["tags"] = request.tags
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    entry = await update_journal_entry(session=session, entry_id=entry_id, fields=fields)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    title = (entry.get("title") or "").strip()
    body_text = extract_journal_text(entry.get("body") or {})
    if not title and not body_text:
        await delete_journal_entry(session, entry_id)
        return Response(status_code=204)
    enqueue_ingest(entry)
    return entry


@app.delete("/v1/journal/entries/{entry_id:uuid}", status_code=204)
async def delete_entry(
    entry_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    deleted = await delete_journal_entry(session, entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Journal entry not found")


@app.post("/v1/journal/entries/{entry_id:uuid}/restore", response_model=JournalEntry)
async def restore_entry(
    entry_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    entry = await restore_journal_entry(session, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@app.post("/v1/rag/reindex/journal", response_model=RagIngestJob)
async def reindex_journal(
    embedding_model: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    model = embedding_model or DEFAULT_EMBEDDING_MODEL
    job = await create_ingest_job(session=session, embedding_model=model)
    asyncio.create_task(reindex_journal_entries(job["id"], model))
    return job


@app.get("/v1/rag/jobs/{job_id}", response_model=RagIngestJob)
async def get_rag_job(
    job_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    job = await get_ingest_job(session, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="RAG job not found")
    return job

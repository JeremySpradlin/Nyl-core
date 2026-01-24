import os

from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
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
    update_journal_entry,
    list_journal_entries,
)
from .ollama import (
    chat,
    get_ollama_client,
    is_allowed_chat_model,
    list_models,
    shutdown_ollama_client,
    startup_ollama_client,
    stream_chat,
)
from .schemas import (
    ChatRequest,
    JournalEntry,
    JournalEntryCreate,
    JournalEntryEnsure,
    JournalEntryUpdate,
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


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatRequest,
    client: httpx.AsyncClient = Depends(get_ollama_client),
):
    if not is_allowed_chat_model(request.model):
        raise HTTPException(status_code=400, detail="Model is not allowed for chat")
    if request.stream:
        return StreamingResponse(
            stream_chat(request, client),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    return await chat(request, client)


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
    session: AsyncSession = Depends(get_session),
):
    return await list_journal_entries(session=session, scope=scope, limit=limit)


@app.get("/v1/journal/entries/{entry_id}", response_model=JournalEntry)
async def get_entry(
    entry_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    entry = await get_journal_entry(session, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return entry


@app.patch("/v1/journal/entries/{entry_id}", response_model=JournalEntry)
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
    return entry


@app.delete("/v1/journal/entries/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    deleted = await delete_journal_entry(session, entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Journal entry not found")

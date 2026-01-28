from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SCOPE_PATTERN = r"^(daily|project:[a-z0-9-]+)$"
Scope = Annotated[str, Field(pattern=SCOPE_PATTERN)]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatSessionCreate(BaseModel):
    title: str | None = None
    model: str | None = None
    system_prompt: str | None = None


class ChatSession(BaseModel):
    id: UUID
    title: str
    model: str | None = None
    system_prompt: str | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    deleted_at: datetime | None = None


class ChatMessageRecord(BaseModel):
    id: UUID
    session_id: UUID
    role: Literal["system", "user", "assistant"]
    content: str
    created_at: datetime


class ChatMessageCreate(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatSessionDetail(BaseModel):
    session: ChatSession
    messages: list[ChatMessageRecord]


class RagConfig(BaseModel):
    enabled: bool = False
    source: str | None = None
    top_k: int | None = Field(default=None, ge=1)
    embedding_model: str | None = None


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = True
    rag: RagConfig | None = None


class JournalEntryCreate(BaseModel):
    journal_date: date
    scope: Scope
    title: str | None = None
    body: dict[str, Any]
    tags: list[str] | None = None


class JournalEntryEnsure(BaseModel):
    journal_date: date
    scope: Scope
    title: str | None = None
    body: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] | None = None


class JournalEntryUpdate(BaseModel):
    title: str | None = None
    body: dict[str, Any] | None = None
    tags: list[str] | None = None


class JournalEntry(BaseModel):
    id: UUID
    created_at: datetime
    journal_date: date
    scope: Scope
    title: str | None = None
    body: dict[str, Any]
    tags: list[str] | None = None
    is_deleted: bool = False
    deleted_at: datetime | None = None


class JournalEntryMarker(BaseModel):
    journal_date: date
    scope: Scope
    count: int


class JournalTask(BaseModel):
    id: UUID
    entry_id: UUID
    created_at: datetime
    text: str
    done: bool
    sort_order: int


class JournalTaskCreate(BaseModel):
    text: str
    sort_order: int | None = None


class JournalTaskUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None
    sort_order: int | None = None


class RagIngestJob(BaseModel):
    id: UUID
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status: Literal["pending", "running", "completed", "failed"]
    source_type: str
    embedding_model: str
    total: int
    processed: int
    error_message: str | None = None

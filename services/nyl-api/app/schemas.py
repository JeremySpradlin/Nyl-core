from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SCOPE_PATTERN = r"^(daily|project:[a-z0-9-]+)$"
Scope = Annotated[str, Field(pattern=SCOPE_PATTERN)]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class RagConfig(BaseModel):
    enabled: bool = False
    source: str | None = None
    top_k: int | None = Field(default=None, ge=1)


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = True
    rag: RagConfig | None = None


class JournalEntryCreate(BaseModel):
    journal_date: date
    scope: Scope
    title: str | None = None
    body: str
    tags: list[str] | None = None


class JournalEntryEnsure(BaseModel):
    journal_date: date
    scope: Scope
    title: str | None = None
    body: str = ""
    tags: list[str] | None = None


class JournalEntryUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    tags: list[str] | None = None


class JournalEntry(BaseModel):
    id: UUID
    created_at: datetime
    journal_date: date
    scope: Scope
    title: str | None = None
    body: str
    tags: list[str] | None = None

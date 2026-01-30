from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    journal_date: Mapped[date] = mapped_column(Date, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    body: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    embedding_model: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index(
            "journal_entries_scope_date_idx",
            "scope",
            journal_date.desc(),
            created_at.desc(),
        ),
        UniqueConstraint("scope", "journal_date", name="journal_entries_scope_date_key"),
    )


class RagIngestJob(Base):
    __tablename__ = "rag_ingest_jobs"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    source_type: Mapped[str] = mapped_column(Text, nullable=False, default="journal")
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    total: Mapped[int] = mapped_column(nullable=False, default=0)
    processed: Mapped[int] = mapped_column(nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("rag_ingest_jobs_status_idx", "status"),
    )


class JournalTask(Base):
    __tablename__ = "journal_tasks"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    entry_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)

    __table_args__ = (
        Index("journal_tasks_entry_idx", "entry_id", "sort_order"),
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="New chat")
    model: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("chat_sessions_updated_idx", "updated_at"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("chat_messages_session_idx", "session_id", "created_at"),
    )

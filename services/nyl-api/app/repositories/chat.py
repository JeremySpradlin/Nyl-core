from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ChatMessage, ChatSession
from .base import ChatStatus, chat_status_filters


def _session_to_dict(session: ChatSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "title": session.title,
        "model": session.model,
        "system_prompt": session.system_prompt,
        "scope": session.scope,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "archived_at": session.archived_at,
        "deleted_at": session.deleted_at,
    }


def _message_to_dict(message: ChatMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "session_id": message.session_id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at,
    }


class ChatRepository:
    """Repository for chat session and message database operations."""

    # -------------------------------------------------------------------------
    # Session CRUD
    # -------------------------------------------------------------------------

    async def create_session(
        self,
        session: AsyncSession,
        *,
        title: str | None,
        model: str | None,
        system_prompt: str | None,
        scope: str | None,
    ) -> dict[str, Any]:
        """Create a new chat session."""
        chat_session = ChatSession(
            id=uuid4(),
            title=(title or "New chat").strip() or "New chat",
            model=model,
            system_prompt=system_prompt,
            scope=scope,
        )
        session.add(chat_session)
        await session.commit()
        await session.refresh(chat_session)
        return _session_to_dict(chat_session)

    async def get_session(
        self,
        session: AsyncSession,
        session_id: UUID,
        include_deleted: bool = False,
    ) -> dict[str, Any] | None:
        """Get a chat session by ID."""
        filters = [ChatSession.id == session_id]
        if not include_deleted:
            filters.append(ChatSession.deleted_at.is_(None))
        result = await session.execute(select(ChatSession).where(*filters))
        chat_session = result.scalar_one_or_none()
        return _session_to_dict(chat_session) if chat_session else None

    async def list_sessions(
        self,
        session: AsyncSession,
        *,
        status: ChatStatus | str = ChatStatus.ACTIVE,
        scope: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List chat sessions with status and optional scope filtering.

        If scope is None: no scope filter (returns all)
        If scope is "": filter for scope IS NULL (unscoped chats only)
        If scope is "project:xxx": filter for that specific scope
        """
        filters = chat_status_filters(
            status, ChatSession.deleted_at, ChatSession.archived_at
        )
        if scope is not None:
            if scope == "":
                filters.append(ChatSession.scope.is_(None))
            else:
                filters.append(ChatSession.scope == scope)
        result = await session.execute(
            select(ChatSession)
            .where(*filters)
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        return [_session_to_dict(item) for item in result.scalars().all()]

    async def update_session_title(
        self,
        session: AsyncSession,
        session_id: UUID,
        title: str,
    ) -> bool:
        """Update session title."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return False
        chat_session.title = title
        await session.commit()
        return True

    async def archive_session(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> dict[str, Any] | None:
        """Archive a chat session."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return None
        chat_session.archived_at = func.now()
        await session.commit()
        await session.refresh(chat_session)
        return _session_to_dict(chat_session)

    async def unarchive_session(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> dict[str, Any] | None:
        """Unarchive a chat session."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return None
        chat_session.archived_at = None
        await session.commit()
        await session.refresh(chat_session)
        return _session_to_dict(chat_session)

    async def soft_delete_session(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> dict[str, Any] | None:
        """Soft delete a chat session."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return None
        chat_session.deleted_at = func.now()
        await session.commit()
        await session.refresh(chat_session)
        return _session_to_dict(chat_session)

    async def restore_session(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> dict[str, Any] | None:
        """Restore a soft-deleted chat session."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return None
        chat_session.deleted_at = None
        await session.commit()
        await session.refresh(chat_session)
        return _session_to_dict(chat_session)

    async def purge_deleted_sessions(
        self,
        session: AsyncSession,
        *,
        older_than_days: int = 30,
    ) -> None:
        """Permanently delete sessions that have been soft-deleted for a while."""
        cutoff = datetime.utcnow() - timedelta(days=older_than_days)
        await session.execute(
            delete(ChatMessage).where(
                ChatMessage.session_id.in_(
                    select(ChatSession.id).where(ChatSession.deleted_at < cutoff)
                )
            )
        )
        await session.execute(
            delete(ChatSession).where(ChatSession.deleted_at < cutoff)
        )
        await session.commit()

    # -------------------------------------------------------------------------
    # Message CRUD
    # -------------------------------------------------------------------------

    async def list_messages(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all messages in a chat session."""
        result = await session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
        return [_message_to_dict(message) for message in result.scalars().all()]

    async def add_messages(
        self,
        session: AsyncSession,
        session_id: UUID,
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Add messages to a chat session. Returns empty list if session not found/deleted."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None or chat_session.deleted_at is not None:
            return []

        created = []
        for message in messages:
            created.append(
                ChatMessage(
                    session_id=session_id,
                    role=message["role"],
                    content=message["content"],
                )
            )
        session.add_all(created)

        # Update session's updated_at timestamp
        await session.execute(
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(updated_at=func.now())
        )
        await session.commit()
        return [_message_to_dict(item) for item in created]

    async def update_session_metadata(
        self,
        session: AsyncSession,
        session_id: UUID,
        *,
        model: str | None = None,
        system_prompt: str | None = None,
        title: str | None = None,
    ) -> bool:
        """Update session metadata (model, system_prompt, title)."""
        result = await session.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        chat_session = result.scalar_one_or_none()
        if chat_session is None:
            return False

        if model is not None:
            chat_session.model = model
        if system_prompt is not None:
            chat_session.system_prompt = system_prompt
        if title is not None:
            chat_session.title = title

        await session.commit()
        return True

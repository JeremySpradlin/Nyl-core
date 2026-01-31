from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories import ChatRepository, ChatStatus


class ChatService:
    """Service layer for chat operations with business logic."""

    def __init__(self, session: AsyncSession):
        self._session = session
        self._repo = ChatRepository()

    async def create_session(
        self,
        *,
        title: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        scope: str | None = None,
    ) -> dict[str, Any]:
        """Create a new chat session."""
        return await self._repo.create_session(
            self._session,
            title=title,
            model=model,
            system_prompt=system_prompt,
            scope=scope,
        )

    async def get_session(
        self,
        session_id: UUID,
        include_deleted: bool = False,
    ) -> dict[str, Any] | None:
        """Get a chat session by ID."""
        return await self._repo.get_session(
            self._session, session_id, include_deleted=include_deleted
        )

    async def get_session_with_messages(
        self,
        session_id: UUID,
        include_deleted: bool = False,
    ) -> dict[str, Any] | None:
        """Get a chat session with all its messages."""
        chat_session = await self._repo.get_session(
            self._session, session_id, include_deleted=include_deleted
        )
        if chat_session is None:
            return None
        messages = await self._repo.list_messages(self._session, session_id)
        return {"session": chat_session, "messages": messages}

    async def list_sessions(
        self,
        status: ChatStatus | str = ChatStatus.ACTIVE,
        scope: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """List chat sessions with status and optional scope filtering."""
        return await self._repo.list_sessions(
            self._session, status=status, scope=scope, limit=limit
        )

    async def add_messages(
        self,
        session_id: UUID,
        messages: list[dict[str, Any]],
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Add messages to a chat session.

        Handles:
        - Auto-generating title from first user message if title is "New chat"
        - Updating model/system_prompt if provided
        """
        # First add the messages
        created = await self._repo.add_messages(self._session, session_id, messages)
        if not created:
            return []

        # Get session to check if we need to update title
        chat_session = await self._repo.get_session(self._session, session_id)
        if chat_session is None:
            return created

        # Determine if we should update metadata
        should_update_title = False
        new_title = None

        if chat_session["title"].strip().lower() == "new chat":
            for message in messages:
                if message["role"] == "user":
                    title_text = message["content"].strip()
                    if title_text:
                        new_title = title_text[:80]
                        should_update_title = True
                    break

        # Update metadata if needed
        if model is not None or system_prompt is not None or should_update_title:
            await self._repo.update_session_metadata(
                self._session,
                session_id,
                model=model,
                system_prompt=system_prompt,
                title=new_title if should_update_title else None,
            )

        return created

    async def archive_session(self, session_id: UUID) -> dict[str, Any] | None:
        """Archive a chat session."""
        return await self._repo.archive_session(self._session, session_id)

    async def unarchive_session(self, session_id: UUID) -> dict[str, Any] | None:
        """Unarchive a chat session."""
        return await self._repo.unarchive_session(self._session, session_id)

    async def delete_session(self, session_id: UUID) -> dict[str, Any] | None:
        """Soft delete a chat session."""
        return await self._repo.soft_delete_session(self._session, session_id)

    async def restore_session(self, session_id: UUID) -> dict[str, Any] | None:
        """Restore a soft-deleted chat session."""
        return await self._repo.restore_session(self._session, session_id)

    async def purge_deleted_sessions(self, older_than_days: int = 30) -> None:
        """Permanently delete sessions that have been soft-deleted for a while."""
        await self._repo.purge_deleted_sessions(
            self._session, older_than_days=older_than_days
        )

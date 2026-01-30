from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ChatMessage, ChatSession, JournalEntry, JournalTask


def _entry_to_dict(entry: JournalEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "created_at": entry.created_at,
        "journal_date": entry.journal_date,
        "scope": entry.scope,
        "title": entry.title,
        "body": entry.body,
        "tags": entry.tags,
        "is_deleted": entry.is_deleted,
        "deleted_at": entry.deleted_at,
        "embedding_model": entry.embedding_model,
        "content_hash": entry.content_hash,
    }


def _task_to_dict(task: JournalTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "entry_id": task.entry_id,
        "created_at": task.created_at,
        "text": task.text,
        "done": task.done,
        "sort_order": task.sort_order,
    }


def _session_to_dict(session: ChatSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "title": session.title,
        "model": session.model,
        "system_prompt": session.system_prompt,
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


async def create_journal_entry(
    *,
    session: AsyncSession,
    journal_date: date,
    scope: str,
    title: str | None,
    body: dict[str, Any],
    tags: list[str] | None,
) -> dict[str, Any]:
    entry = JournalEntry(
        id=uuid4(),
        journal_date=journal_date,
        scope=scope,
        title=title,
        body=body,
        tags=tags,
    )
    session.add(entry)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise
    await session.refresh(entry)
    return _entry_to_dict(entry)


async def list_journal_entries(
    *, session: AsyncSession, scope: str, limit: int, status: str = "active"
) -> list[dict[str, Any]]:
    filters = [JournalEntry.scope == scope]
    if status == "active":
        filters.append(JournalEntry.is_deleted.is_(False))
    elif status == "deleted":
        filters.append(JournalEntry.is_deleted.is_(True))
    result = await session.execute(
        select(JournalEntry)
        .where(*filters)
        .order_by(JournalEntry.journal_date.desc(), JournalEntry.created_at.desc())
        .limit(limit)
    )
    return [_entry_to_dict(entry) for entry in result.scalars().all()]


async def list_journal_scopes(*, session: AsyncSession) -> list[str]:
    result = await session.execute(
        select(JournalEntry.scope)
        .where(JournalEntry.is_deleted.is_(False))
        .distinct()
        .order_by(JournalEntry.scope.asc())
    )
    return [row[0] for row in result.all()]


async def list_journal_entry_markers(
    *,
    session: AsyncSession,
    start_date: date,
    end_date: date,
    scope: str | None = None,
) -> list[dict[str, Any]]:
    query = (
        select(
            JournalEntry.journal_date,
            JournalEntry.scope,
            func.count(JournalEntry.id).label("count"),
        )
        .where(
            JournalEntry.journal_date.between(start_date, end_date),
            JournalEntry.is_deleted.is_(False),
        )
        .group_by(JournalEntry.journal_date, JournalEntry.scope)
        .order_by(JournalEntry.journal_date.asc())
    )
    if scope:
        query = query.where(JournalEntry.scope == scope)
    result = await session.execute(query)
    return [
        {"journal_date": row.journal_date, "scope": row.scope, "count": row.count}
        for row in result.all()
    ]


async def get_journal_entry(
    session: AsyncSession, entry_id: UUID, include_deleted: bool = False
) -> dict[str, Any] | None:
    filters = [JournalEntry.id == entry_id]
    if not include_deleted:
        filters.append(JournalEntry.is_deleted.is_(False))
    result = await session.execute(select(JournalEntry).where(*filters))
    entry = result.scalar_one_or_none()
    return _entry_to_dict(entry) if entry else None


async def get_journal_entry_by_date(
    *, session: AsyncSession, scope: str, journal_date: date, include_deleted: bool = False
) -> dict[str, Any] | None:
    filters = [JournalEntry.scope == scope, JournalEntry.journal_date == journal_date]
    if not include_deleted:
        filters.append(JournalEntry.is_deleted.is_(False))
    result = await session.execute(
        select(JournalEntry).where(*filters)
    )
    entry = result.scalar_one_or_none()
    return _entry_to_dict(entry) if entry else None


async def ensure_journal_entry(
    *,
    session: AsyncSession,
    journal_date: date,
    scope: str,
    title: str | None,
    body: dict[str, Any],
    tags: list[str] | None,
) -> dict[str, Any]:
    entry = JournalEntry(
        id=uuid4(),
        journal_date=journal_date,
        scope=scope,
        title=title,
        body=body,
        tags=tags,
    )
    session.add(entry)
    try:
        await session.commit()
        await session.refresh(entry)
        return _entry_to_dict(entry)
    except IntegrityError:
        await session.rollback()
    result = await session.execute(
        select(JournalEntry).where(
            JournalEntry.scope == scope, JournalEntry.journal_date == journal_date
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        raise RuntimeError("Failed to ensure journal entry")
    if existing.is_deleted:
        existing.is_deleted = False
        existing.deleted_at = None
        existing.title = title
        existing.body = body
        existing.tags = tags
        await session.commit()
        await session.refresh(existing)
    return _entry_to_dict(existing)


async def update_journal_entry(
    *, session: AsyncSession, entry_id: UUID, fields: dict[str, Any]
) -> dict[str, Any] | None:
    if not fields:
        return await get_journal_entry(session, entry_id)
    result = await session.execute(select(JournalEntry).where(JournalEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    for key, value in fields.items():
        setattr(entry, key, value)
    await session.commit()
    await session.refresh(entry)
    return _entry_to_dict(entry)


async def delete_journal_entry(session: AsyncSession, entry_id: UUID) -> bool:
    result = await session.execute(select(JournalEntry).where(JournalEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    entry.is_deleted = True
    entry.deleted_at = func.now()
    await session.commit()
    return True


async def restore_journal_entry(session: AsyncSession, entry_id: UUID) -> dict[str, Any] | None:
    result = await session.execute(select(JournalEntry).where(JournalEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    entry.is_deleted = False
    entry.deleted_at = None
    await session.commit()
    await session.refresh(entry)
    return _entry_to_dict(entry)


async def list_journal_tasks(
    *, session: AsyncSession, entry_id: UUID
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(JournalTask)
        .where(JournalTask.entry_id == entry_id)
        .order_by(JournalTask.sort_order.asc(), JournalTask.created_at.asc())
    )
    return [_task_to_dict(task) for task in result.scalars().all()]


async def create_journal_task(
    *, session: AsyncSession, entry_id: UUID, text: str, sort_order: int
) -> dict[str, Any]:
    task = JournalTask(entry_id=entry_id, text=text, sort_order=sort_order)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return _task_to_dict(task)


async def update_journal_task(
    *, session: AsyncSession, task_id: UUID, fields: dict[str, Any]
) -> dict[str, Any] | None:
    if not fields:
        return await get_journal_task(session=session, task_id=task_id)
    result = await session.execute(select(JournalTask).where(JournalTask.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        return None
    for key, value in fields.items():
        setattr(task, key, value)
    await session.commit()
    await session.refresh(task)
    return _task_to_dict(task)


async def delete_journal_task(session: AsyncSession, task_id: UUID) -> bool:
    result = await session.execute(select(JournalTask).where(JournalTask.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        return False
    await session.delete(task)
    await session.commit()
    return True


async def get_journal_task(
    *, session: AsyncSession, task_id: UUID
) -> dict[str, Any] | None:
    result = await session.execute(select(JournalTask).where(JournalTask.id == task_id))
    task = result.scalar_one_or_none()
    return _task_to_dict(task) if task else None


async def purge_deleted_chat_sessions(session: AsyncSession, *, older_than_days: int = 30) -> None:
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


async def create_chat_session(
    *,
    session: AsyncSession,
    title: str | None,
    model: str | None,
    system_prompt: str | None,
) -> dict[str, Any]:
    chat_session = ChatSession(
        id=uuid4(),
        title=(title or "New chat").strip() or "New chat",
        model=model,
        system_prompt=system_prompt,
    )
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return _session_to_dict(chat_session)


async def list_chat_sessions(
    *,
    session: AsyncSession,
    status: str = "active",
    limit: int = 100,
) -> list[dict[str, Any]]:
    if status == "active":
        filters = [ChatSession.deleted_at.is_(None), ChatSession.archived_at.is_(None)]
    elif status == "archived":
        filters = [ChatSession.deleted_at.is_(None), ChatSession.archived_at.is_not(None)]
    elif status == "deleted":
        filters = [ChatSession.deleted_at.is_not(None)]
    else:
        filters = [ChatSession.deleted_at.is_(None)]
    result = await session.execute(
        select(ChatSession)
        .where(*filters)
        .order_by(ChatSession.updated_at.desc())
        .limit(limit)
    )
    return [_session_to_dict(item) for item in result.scalars().all()]


async def get_chat_session(
    *, session: AsyncSession, session_id: UUID, include_deleted: bool = False
) -> dict[str, Any] | None:
    filters = [ChatSession.id == session_id]
    if not include_deleted:
        filters.append(ChatSession.deleted_at.is_(None))
    result = await session.execute(select(ChatSession).where(*filters))
    chat_session = result.scalar_one_or_none()
    return _session_to_dict(chat_session) if chat_session else None


async def list_chat_messages(
    *, session: AsyncSession, session_id: UUID
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return [_message_to_dict(message) for message in result.scalars().all()]


async def add_chat_messages(
    *,
    session: AsyncSession,
    session_id: UUID,
    messages: list[dict[str, Any]],
    model: str | None = None,
    system_prompt: str | None = None,
) -> list[dict[str, Any]]:
    result = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
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
    if model is not None:
        chat_session.model = model
    if system_prompt is not None:
        chat_session.system_prompt = system_prompt
    if chat_session.title.strip().lower() == "new chat":
        for message in messages:
            if message["role"] == "user":
                title = message["content"].strip()
                if title:
                    chat_session.title = title[:80]
                break
    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id)
        .values(updated_at=func.now())
    )
    await session.commit()
    return [_message_to_dict(item) for item in created]


async def archive_chat_session(session: AsyncSession, session_id: UUID) -> dict[str, Any] | None:
    result = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
    chat_session = result.scalar_one_or_none()
    if chat_session is None:
        return None
    chat_session.archived_at = func.now()
    await session.commit()
    await session.refresh(chat_session)
    return _session_to_dict(chat_session)


async def unarchive_chat_session(
    session: AsyncSession, session_id: UUID
) -> dict[str, Any] | None:
    result = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
    chat_session = result.scalar_one_or_none()
    if chat_session is None:
        return None
    chat_session.archived_at = None
    await session.commit()
    await session.refresh(chat_session)
    return _session_to_dict(chat_session)


async def soft_delete_chat_session(
    session: AsyncSession, session_id: UUID
) -> dict[str, Any] | None:
    result = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
    chat_session = result.scalar_one_or_none()
    if chat_session is None:
        return None
    chat_session.deleted_at = func.now()
    await session.commit()
    await session.refresh(chat_session)
    return _session_to_dict(chat_session)


async def restore_chat_session(
    session: AsyncSession, session_id: UUID
) -> dict[str, Any] | None:
    result = await session.execute(select(ChatSession).where(ChatSession.id == session_id))
    chat_session = result.scalar_one_or_none()
    if chat_session is None:
        return None
    chat_session.deleted_at = None
    await session.commit()
    await session.refresh(chat_session)
    return _session_to_dict(chat_session)


async def search_journal_entries_by_vector(
    session: AsyncSession,
    embedding: list[float],
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Search journal entries by cosine similarity."""
    result = await session.execute(
        select(JournalEntry)
        .where(JournalEntry.is_deleted.is_(False))
        .where(JournalEntry.embedding.isnot(None))
        .order_by(JournalEntry.embedding.cosine_distance(embedding))
        .limit(limit)
    )
    return [_entry_to_dict(e) for e in result.scalars().all()]


async def update_journal_entry_embedding(
    session: AsyncSession,
    entry_id: UUID,
    embedding: list[float],
    embedding_model: str,
    content_hash: str,
) -> bool:
    """Update embedding for a journal entry."""
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    entry.embedding = embedding
    entry.embedding_model = embedding_model
    entry.content_hash = content_hash
    await session.commit()
    return True


async def clear_journal_entry_embedding(
    session: AsyncSession,
    entry_id: UUID,
) -> bool:
    """Clear embedding for a journal entry (when content is empty)."""
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    entry.embedding = None
    entry.embedding_model = None
    entry.content_hash = None
    await session.commit()
    return True


async def get_journal_entry_embedding_info(
    session: AsyncSession,
    entry_id: UUID,
) -> dict[str, Any] | None:
    """Get embedding metadata for a journal entry."""
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    return {
        "content_hash": entry.content_hash,
        "embedding_model": entry.embedding_model,
    }

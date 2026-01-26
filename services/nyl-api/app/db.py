from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .models import JournalEntry


def _entry_to_dict(entry: JournalEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "created_at": entry.created_at,
        "journal_date": entry.journal_date,
        "scope": entry.scope,
        "title": entry.title,
        "body": entry.body,
        "tags": entry.tags,
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
    *, session: AsyncSession, scope: str, limit: int
) -> list[dict[str, Any]]:
    result = await session.execute(
        select(JournalEntry)
        .where(JournalEntry.scope == scope)
        .order_by(JournalEntry.journal_date.desc(), JournalEntry.created_at.desc())
        .limit(limit)
    )
    return [_entry_to_dict(entry) for entry in result.scalars().all()]


async def list_journal_scopes(*, session: AsyncSession) -> list[str]:
    result = await session.execute(
        select(JournalEntry.scope).distinct().order_by(JournalEntry.scope.asc())
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
        .where(JournalEntry.journal_date.between(start_date, end_date))
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
    session: AsyncSession, entry_id: UUID
) -> dict[str, Any] | None:
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    return _entry_to_dict(entry) if entry else None


async def get_journal_entry_by_date(
    *, session: AsyncSession, scope: str, journal_date: date
) -> dict[str, Any] | None:
    result = await session.execute(
        select(JournalEntry).where(
            JournalEntry.scope == scope, JournalEntry.journal_date == journal_date
        )
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
    existing = await get_journal_entry_by_date(
        session=session, scope=scope, journal_date=journal_date
    )
    if existing is None:
        raise RuntimeError("Failed to ensure journal entry")
    return existing


async def update_journal_entry(
    *, session: AsyncSession, entry_id: UUID, fields: dict[str, Any]
) -> dict[str, Any] | None:
    if not fields:
        return await get_journal_entry(session, entry_id)
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return None
    for key, value in fields.items():
        setattr(entry, key, value)
    await session.commit()
    await session.refresh(entry)
    return _entry_to_dict(entry)


async def delete_journal_entry(session: AsyncSession, entry_id: UUID) -> bool:
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return False
    await session.delete(entry)
    await session.commit()
    return True

import asyncio
import logging
import os
from datetime import date
from typing import Any
from uuid import UUID, uuid4

import asyncpg

_db_pool: asyncpg.Pool | None = None
_logger = logging.getLogger(__name__)

DB_CONNECT_RETRIES = int(os.getenv("DB_CONNECT_RETRIES", "10"))
DB_CONNECT_DELAY = float(os.getenv("DB_CONNECT_DELAY", "2"))


def _build_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    host = os.getenv("POSTGRES_HOST", "postgres")
    db = os.getenv("POSTGRES_DB", "nyl")
    user = os.getenv("POSTGRES_USER", "nyl")
    password = os.getenv("POSTGRES_PASSWORD", "")
    return f"postgresql://{user}:{password}@{host}:5432/{db}"


async def startup_db() -> None:
    global _db_pool
    if _db_pool is not None:
        return
    last_error: Exception | None = None
    for attempt in range(1, DB_CONNECT_RETRIES + 1):
        try:
            _db_pool = await asyncpg.create_pool(dsn=_build_database_url())
            async with _db_pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS journal_entries (
                        id uuid PRIMARY KEY,
                        created_at timestamptz NOT NULL DEFAULT now(),
                        journal_date date NOT NULL,
                        scope text NOT NULL,
                        title text,
                        body jsonb NOT NULL,
                        tags text[]
                    )
                    """
                )
                await conn.execute(
                    """
                    ALTER TABLE journal_entries
                    ALTER COLUMN body TYPE jsonb USING to_jsonb(body)
                    """
                )
                await conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS journal_entries_scope_date_idx
                    ON journal_entries (scope, journal_date DESC, created_at DESC)
                    """
                )
                await conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_scope_date_key
                    ON journal_entries (scope, journal_date)
                    """
                )
            return
        except Exception as exc:
            last_error = exc
            if _db_pool is not None:
                await _db_pool.close()
                _db_pool = None
            if attempt == DB_CONNECT_RETRIES:
                break
            _logger.warning(
                "Database connection attempt %s/%s failed; retrying in %ss",
                attempt,
                DB_CONNECT_RETRIES,
                DB_CONNECT_DELAY,
            )
            await asyncio.sleep(DB_CONNECT_DELAY)
    raise RuntimeError("Database connection failed") from last_error


async def shutdown_db() -> None:
    global _db_pool
    if _db_pool is None:
        return
    await _db_pool.close()
    _db_pool = None


def get_db_pool() -> asyncpg.Pool:
    if _db_pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _db_pool


async def create_journal_entry(
    *,
    pool: asyncpg.Pool,
    journal_date: date,
    scope: str,
    title: str | None,
    body: dict[str, Any],
    tags: list[str] | None,
) -> dict[str, Any]:
    entry_id = uuid4()
    row = await pool.fetchrow(
        """
        INSERT INTO journal_entries (id, journal_date, scope, title, body, tags)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, journal_date, scope, title, body, tags
        """,
        entry_id,
        journal_date,
        scope,
        title,
        body,
        tags,
    )
    if row is None:
        raise RuntimeError("Failed to create journal entry")
    return dict(row)


async def list_journal_entries(
    *, pool: asyncpg.Pool, scope: str, limit: int
) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """
        SELECT id, created_at, journal_date, scope, title, body, tags
        FROM journal_entries
        WHERE scope = $1
        ORDER BY journal_date DESC, created_at DESC
        LIMIT $2
        """,
        scope,
        limit,
    )
    return [dict(row) for row in rows]


async def get_journal_entry(pool: asyncpg.Pool, entry_id: UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """
        SELECT id, created_at, journal_date, scope, title, body, tags
        FROM journal_entries
        WHERE id = $1
        """,
        entry_id,
    )
    return dict(row) if row else None


async def get_journal_entry_by_date(
    *, pool: asyncpg.Pool, scope: str, journal_date: date
) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """
        SELECT id, created_at, journal_date, scope, title, body, tags
        FROM journal_entries
        WHERE scope = $1 AND journal_date = $2
        """,
        scope,
        journal_date,
    )
    return dict(row) if row else None


async def ensure_journal_entry(
    *,
    pool: asyncpg.Pool,
    journal_date: date,
    scope: str,
    title: str | None,
    body: dict[str, Any],
    tags: list[str] | None,
) -> dict[str, Any]:
    row = await pool.fetchrow(
        """
        INSERT INTO journal_entries (id, journal_date, scope, title, body, tags)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (scope, journal_date) DO NOTHING
        RETURNING id, created_at, journal_date, scope, title, body, tags
        """,
        uuid4(),
        journal_date,
        scope,
        title,
        body,
        tags,
    )
    if row is not None:
        return dict(row)
    existing = await get_journal_entry_by_date(
        pool=pool, scope=scope, journal_date=journal_date
    )
    if existing is None:
        raise RuntimeError("Failed to ensure journal entry")
    return existing


async def update_journal_entry(
    *, pool: asyncpg.Pool, entry_id: UUID, fields: dict[str, Any]
) -> dict[str, Any] | None:
    if not fields:
        return await get_journal_entry(pool, entry_id)
    set_clauses: list[str] = []
    values: list[Any] = [entry_id]
    for key, value in fields.items():
        values.append(value)
        set_clauses.append(f"{key} = ${len(values)}")
    query = f"""
        UPDATE journal_entries
        SET {", ".join(set_clauses)}
        WHERE id = $1
        RETURNING id, created_at, journal_date, scope, title, body, tags
    """
    row = await pool.fetchrow(query, *values)
    return dict(row) if row else None


async def delete_journal_entry(pool: asyncpg.Pool, entry_id: UUID) -> bool:
    result = await pool.execute(
        """
        DELETE FROM journal_entries
        WHERE id = $1
        """,
        entry_id,
    )
    return result.startswith("DELETE") and not result.endswith(" 0")

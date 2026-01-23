from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

import app.main as main
from app.schemas import JournalEntryCreate


@pytest.mark.asyncio
async def test_create_journal_entry(monkeypatch):
    entry_id = uuid4()
    created_at = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)

    async def fake_create_journal_entry(**kwargs):
        return {
            "id": entry_id,
            "created_at": created_at,
            "journal_date": date(2024, 1, 1),
            "scope": "daily",
            "title": "Morning",
            "body": "Started the day.",
            "tags": ["routine"],
        }

    monkeypatch.setattr(main, "create_journal_entry", fake_create_journal_entry)
    payload = JournalEntryCreate(
        journal_date=date(2024, 1, 1),
        scope="daily",
        title="Morning",
        body="Started the day.",
        tags=["routine"],
    )

    data = await main.create_entry(payload, pool=object())
    assert str(data["id"]) == str(entry_id)
    assert data["scope"] == "daily"


@pytest.mark.asyncio
async def test_list_journal_entries(monkeypatch):
    created_at = datetime(2024, 1, 2, 8, 30, tzinfo=timezone.utc)
    entries = [
        {
            "id": uuid4(),
            "created_at": created_at,
            "journal_date": date(2024, 1, 2),
            "scope": "project:nyl",
            "title": None,
            "body": "Planning.",
            "tags": None,
        }
    ]

    async def fake_list_journal_entries(**kwargs):
        return entries

    monkeypatch.setattr(main, "list_journal_entries", fake_list_journal_entries)
    data = await main.list_entries(scope="project:nyl", limit=10, pool=object())
    assert data[0]["scope"] == "project:nyl"


@pytest.mark.asyncio
async def test_get_journal_entry_not_found(monkeypatch):
    async def fake_get_journal_entry(*args, **kwargs):
        return None

    monkeypatch.setattr(main, "get_journal_entry", fake_get_journal_entry)
    with pytest.raises(main.HTTPException) as exc_info:
        await main.get_entry(uuid4(), pool=object())
    assert exc_info.value.status_code == 404


def test_scope_validation():
    with pytest.raises(ValidationError):
        JournalEntryCreate(
            journal_date=date(2024, 1, 1),
            scope="bad-scope",
            title=None,
            body="bad",
            tags=None,
        )

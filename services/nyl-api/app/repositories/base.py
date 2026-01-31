from __future__ import annotations

from enum import Enum
from typing import Any

from sqlalchemy import ColumnElement


class ChatStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


def chat_status_filters(
    status: ChatStatus | str,
    deleted_at_col: Any,
    archived_at_col: Any,
) -> list[ColumnElement[bool]]:
    """Return SQLAlchemy filter conditions for a given chat status."""
    status_value = status.value if isinstance(status, ChatStatus) else status

    if status_value == ChatStatus.ACTIVE.value:
        return [deleted_at_col.is_(None), archived_at_col.is_(None)]
    elif status_value == ChatStatus.ARCHIVED.value:
        return [deleted_at_col.is_(None), archived_at_col.is_not(None)]
    elif status_value == ChatStatus.DELETED.value:
        return [deleted_at_col.is_not(None)]
    else:
        # Default to non-deleted
        return [deleted_at_col.is_(None)]

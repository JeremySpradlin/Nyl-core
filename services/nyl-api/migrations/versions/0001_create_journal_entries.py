"""create journal entries table

Revision ID: 0001_create_journal_entries
Revises: 
Create Date: 2026-01-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_create_journal_entries"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("journal_date", sa.Date(), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", postgresql.JSONB(), nullable=False),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), nullable=True),
    )
    op.create_index(
        "journal_entries_scope_date_idx",
        "journal_entries",
        ["scope", sa.text("journal_date DESC"), sa.text("created_at DESC")],
    )
    op.create_index(
        "journal_entries_scope_date_key",
        "journal_entries",
        ["scope", "journal_date"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("journal_entries_scope_date_key", table_name="journal_entries")
    op.drop_index("journal_entries_scope_date_idx", table_name="journal_entries")
    op.drop_table("journal_entries")

"""add rag ingest jobs table

Revision ID: 0002_add_rag_ingest_jobs
Revises: 0001_create_journal_entries
Create Date: 2026-01-25 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_add_rag_ingest_jobs"
down_revision = "0001_create_journal_entries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rag_ingest_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("processed", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text()),
    )
    op.create_index("rag_ingest_jobs_status_idx", "rag_ingest_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("rag_ingest_jobs_status_idx", table_name="rag_ingest_jobs")
    op.drop_table("rag_ingest_jobs")

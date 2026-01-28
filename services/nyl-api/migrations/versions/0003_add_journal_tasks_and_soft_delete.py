from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_journal_tasks"
down_revision = "0002_add_rag_ingest_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("journal_entries", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("journal_entries", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("journal_entries", "is_deleted", server_default=None)

    op.create_table(
        "journal_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("journal_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("journal_tasks_entry_idx", "journal_tasks", ["entry_id", "sort_order"])
    op.alter_column("journal_tasks", "done", server_default=None)
    op.alter_column("journal_tasks", "sort_order", server_default=None)


def downgrade() -> None:
    op.drop_index("journal_tasks_entry_idx", table_name="journal_tasks")
    op.drop_table("journal_tasks")
    op.drop_column("journal_entries", "deleted_at")
    op.drop_column("journal_entries", "is_deleted")

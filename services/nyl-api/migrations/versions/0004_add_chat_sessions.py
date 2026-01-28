from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_chat_sessions"
down_revision = "0003_journal_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("title", sa.Text(), nullable=False, server_default="New chat"),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("chat_sessions_updated_idx", "chat_sessions", ["updated_at"])
    op.alter_column("chat_sessions", "title", server_default=None)

    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("chat_messages_session_idx", "chat_messages", ["session_id", "created_at"])


def downgrade() -> None:
    op.drop_index("chat_messages_session_idx", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("chat_sessions_updated_idx", table_name="chat_sessions")
    op.drop_table("chat_sessions")

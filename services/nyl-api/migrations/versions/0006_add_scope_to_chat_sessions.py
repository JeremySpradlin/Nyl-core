from alembic import op
import sqlalchemy as sa


revision = "0006_chat_scope"
down_revision = "0005_pgvector"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column("scope", sa.Text(), nullable=True),
    )
    op.create_index(
        "chat_sessions_scope_updated_idx",
        "chat_sessions",
        ["scope", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("chat_sessions_scope_updated_idx", table_name="chat_sessions")
    op.drop_column("chat_sessions", "scope")

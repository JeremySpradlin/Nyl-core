from alembic import op
import sqlalchemy as sa


revision = "0005_pgvector"
down_revision = "0004_chat_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Add columns - embedding as vector type directly
    op.execute("ALTER TABLE journal_entries ADD COLUMN embedding vector(768)")
    op.add_column(
        "journal_entries",
        sa.Column("embedding_model", sa.Text(), nullable=True),
    )
    op.add_column(
        "journal_entries",
        sa.Column("content_hash", sa.Text(), nullable=True),
    )

    # Create HNSW index for fast similarity search
    op.execute(
        "CREATE INDEX journal_entries_embedding_idx "
        "ON journal_entries "
        "USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_index("journal_entries_embedding_idx", table_name="journal_entries")
    op.drop_column("journal_entries", "content_hash")
    op.drop_column("journal_entries", "embedding_model")
    op.drop_column("journal_entries", "embedding")
    op.execute("DROP EXTENSION IF EXISTS vector")

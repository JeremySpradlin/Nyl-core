import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def build_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    host = os.getenv("POSTGRES_HOST", "postgres")
    db = os.getenv("POSTGRES_DB", "nyl")
    user = os.getenv("POSTGRES_USER", "nyl")
    password = os.getenv("POSTGRES_PASSWORD", "")
    return f"postgresql://{user}:{password}@{host}:5432/{db}"


def to_async_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


DATABASE_URL = to_async_url(build_database_url())

engine = create_async_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def startup_db() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))


async def shutdown_db() -> None:
    await engine.dispose()


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session

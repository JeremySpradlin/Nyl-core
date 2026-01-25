from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from .models import RagIngestJob


def _job_to_dict(job: RagIngestJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "status": job.status,
        "source_type": job.source_type,
        "embedding_model": job.embedding_model,
        "total": job.total,
        "processed": job.processed,
        "error_message": job.error_message,
    }


async def create_ingest_job(
    *,
    session: AsyncSession,
    embedding_model: str,
    source_type: str = "journal",
    total: int = 0,
) -> dict[str, Any]:
    job = RagIngestJob(
        id=uuid4(),
        status="pending",
        source_type=source_type,
        embedding_model=embedding_model,
        total=total,
        processed=0,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return _job_to_dict(job)


async def get_ingest_job(session: AsyncSession, job_id: UUID) -> dict[str, Any] | None:
    result = await session.execute(
        select(RagIngestJob).where(RagIngestJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    return _job_to_dict(job) if job else None


async def mark_job_running(session: AsyncSession, job_id: UUID) -> None:
    await session.execute(
        update(RagIngestJob)
        .where(RagIngestJob.id == job_id)
        .values(status="running", started_at=func.now())
    )
    await session.commit()


async def update_job_progress(
    session: AsyncSession, job_id: UUID, processed: int
) -> None:
    await session.execute(
        update(RagIngestJob)
        .where(RagIngestJob.id == job_id)
        .values(processed=processed)
    )
    await session.commit()


async def update_job_total(
    session: AsyncSession, job_id: UUID, total: int
) -> None:
    await session.execute(
        update(RagIngestJob)
        .where(RagIngestJob.id == job_id)
        .values(total=total)
    )
    await session.commit()


async def mark_job_completed(session: AsyncSession, job_id: UUID) -> None:
    await session.execute(
        update(RagIngestJob)
        .where(RagIngestJob.id == job_id)
        .values(status="completed", finished_at=func.now())
    )
    await session.commit()


async def mark_job_failed(
    session: AsyncSession, job_id: UUID, error_message: str
) -> None:
    await session.execute(
        update(RagIngestJob)
        .where(RagIngestJob.id == job_id)
        .values(status="failed", finished_at=func.now(), error_message=error_message)
    )
    await session.commit()

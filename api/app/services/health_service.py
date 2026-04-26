"""Helpers for the /health endpoint.

Each helper degrades to ``None`` rather than raising — a single broken probe
must not take down the whole endpoint.
"""

import contextlib
from datetime import UTC, datetime

from sqlalchemy import func, text
from sqlmodel import Session, select

from app.models.historical_price import FxRate, HistoricalPrice


def _age_seconds(dt: datetime | None) -> int | None:
    if dt is None:
        return None
    # SQLite returns naive datetimes; rows are written with datetime.now(UTC),
    # so treat naive values as UTC.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    # Clamp to zero — minor clock skew between row write and now must not
    # surface as a negative age in the health response.
    return max(0, int((datetime.now(UTC) - dt).total_seconds()))


def _safe_rollback(session: Session) -> None:
    """Best-effort rollback. Failure here (dead connection, etc.) must never
    propagate out of a probe — that would break the "never raise" contract.

    Postgres needs an explicit rollback after a failed query so the next
    probe doesn't hit ``InFailedSqlTransactionError``. SQLite is forgiving
    but a no-op rollback is harmless.
    """
    with contextlib.suppress(Exception):
        session.rollback()


def get_price_cache_age_seconds(session: Session) -> int | None:
    try:
        last = session.exec(select(func.max(HistoricalPrice.created_at))).one()
        return _age_seconds(last)
    except Exception:
        _safe_rollback(session)
        return None


def get_last_fx_rate_age_seconds(session: Session) -> int | None:
    try:
        last = session.exec(select(func.max(FxRate.created_at))).one()
        return _age_seconds(last)
    except Exception:
        _safe_rollback(session)
        return None


def get_migrations_head(session: Session) -> str | None:
    # alembic_version is created by Alembic, not SQLModel — may be absent in
    # in-memory test DBs. Use execute() (raw SQLAlchemy) for text() statements.
    try:
        result = session.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        )
        row = result.first()
        return row[0] if row else None
    except Exception:
        _safe_rollback(session)
        return None

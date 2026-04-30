"""Shared DB-cache helpers for the price services.

``HistoricalPriceService`` uses ``ON CONFLICT DO UPDATE`` against its
price and coverage tables. Keeping the dialect-aware upsert and
silent-on-error cache-write behavior in one place avoids duplication
and keeps the failure semantics consistent.
"""

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session

from app.core.database import engine, is_postgresql

logger = logging.getLogger(__name__)


def bulk_upsert(
    model,
    values: list[dict],
    index_elements: list[str],
    update_fields: list[str],
    label: str,
    session: Session | None = None,
) -> bool:
    """Bulk upsert rows using ON CONFLICT DO UPDATE.

    Errors are logged and swallowed: cache writes must never break the
    request that produced the data. Returns ``True`` on success (or for
    an empty ``values`` no-op) and ``False`` when the inner write
    raised — so callers that record dependent state (e.g. coverage
    rows whose validity depends on a price write) can gate on the
    result.
    """
    if not values:
        return True
    try:

        def _execute(s: Session) -> None:
            insert_fn = pg_insert if is_postgresql else sqlite_insert
            stmt = insert_fn(model).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=index_elements,
                set_={k: getattr(stmt.excluded, k) for k in update_fields},
            )
            s.execute(stmt)

        if session is not None:
            _execute(session)
        else:
            with Session(engine) as s:
                _execute(s)
                s.commit()
        logger.debug("Saved %d %s to cache", len(values), label)
        return True
    except Exception as e:
        logger.error("Failed to save %d %s: %s", len(values), label, e, exc_info=True)
        return False

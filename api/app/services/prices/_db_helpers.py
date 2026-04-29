"""Shared DB-cache helpers for the price services.

Both ``HistoricalPriceService`` and ``FxRateService`` use the same
``ON CONFLICT DO UPDATE`` upsert pattern against their respective tables.
Keeping the helper here avoids duplicating the dialect-aware upsert and
the silent-on-error cache-write behavior.
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
) -> None:
    """Bulk upsert rows using ON CONFLICT DO UPDATE.

    Errors are logged and swallowed: cache writes must never break the
    request that produced the data.
    """
    if not values:
        return
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
    except Exception as e:
        logger.error("Failed to save %d %s: %s", len(values), label, e, exc_info=True)

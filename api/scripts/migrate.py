"""Apply Alembic migrations, then assert the money schema is Decimal.

Run from the ``api/`` directory with the project's virtualenv active::

    python -m scripts.migrate

This is the deploy-time migration path. Hosts that scale horizontally run this
once per build and set ``RUN_MIGRATIONS_ON_STARTUP=false``, so no request-serving
instance ever issues DDL. Local dev and e2e leave the startup hook enabled and
never need this script.

Idempotent — re-running against a database already at head is a fast no-op.
"""

import logging
import sys
from pathlib import Path

# Make ``api/`` importable when invoked as ``python -m scripts.migrate``
# AND as ``python scripts/migrate.py``.
_API_ROOT = Path(__file__).resolve().parents[1]
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from app.core.database import (  # noqa: E402
    run_migrations,
    verify_connection,
    verify_money_columns_are_decimal,
)


def main() -> int:
    """Return a process exit code: 0 on success, 1 on failure."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logger = logging.getLogger("scripts.migrate")

    if not verify_connection():
        logger.error("Database unreachable — refusing to migrate")
        return 1

    run_migrations()
    verify_money_columns_are_decimal()
    # Not logger.info: Alembic's Config runs fileConfig(alembic.ini), which
    # disables every logger configured before it. Writing straight to stdout is
    # the only way this confirmation reliably reaches a build log.
    sys.stdout.write("Migrations complete\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

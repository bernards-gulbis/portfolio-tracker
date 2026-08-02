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
import os
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

_VERCEL_ENVS = ("production", "preview", "development")


def _blocked_reason() -> str | None:
    """Return why this build must not migrate, or ``None`` if it may proceed.

    Vercel runs the build command for *every* environment, and environment
    variables set for "All Environments" are inherited by preview builds. Left
    unchecked, every preview would apply pending migrations to the production
    database. Preview therefore has to prove it owns its database: set
    ``PREVIEW_DATABASE_URL`` (a Neon branch) and the Preview-scoped
    ``DATABASE_URL`` to the same value. An inherited production ``DATABASE_URL``
    no longer matches, and the build fails before any DDL is issued.

    Outside Vercel (``VERCEL_ENV`` unset) nothing is inherited and the caller
    owns the database, so none of this applies.
    """
    env = os.getenv("VERCEL_ENV")
    if env is None:
        return None
    if env not in _VERCEL_ENVS:
        return f"VERCEL_ENV={env!r} is not one of {', '.join(_VERCEL_ENVS)}"

    database_url = os.getenv("DATABASE_URL", "")
    if database_url == "":
        return (
            "DATABASE_URL is unset — refusing to migrate the local SQLite "
            f"default from a {env} build"
        )

    if env != "preview":
        return None

    preview_url = os.getenv("PREVIEW_DATABASE_URL", "")
    if preview_url == "":
        return (
            "Preview builds must not migrate the production database. Create a "
            "database for previews (a Neon branch) and set PREVIEW_DATABASE_URL "
            "and DATABASE_URL to it, scoped to the Preview environment."
        )
    if database_url != preview_url:
        return (
            "DATABASE_URL does not match PREVIEW_DATABASE_URL — this preview "
            "inherited another environment's database. Scope DATABASE_URL to "
            "Preview and point it at the preview database."
        )
    return None


def main() -> int:
    """Return a process exit code: 0 on success, 1 on failure."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logger = logging.getLogger("scripts.migrate")

    blocked = _blocked_reason()
    if blocked is not None:
        logger.error("%s", blocked)
        return 1

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

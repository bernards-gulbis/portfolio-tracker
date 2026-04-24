import logging
from collections.abc import Generator
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import Engine, event, text
from sqlalchemy import inspect as sa_inspect
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import DATABASE_ECHO, DATABASE_URL, DB_MAX_OVERFLOW, DB_POOL_SIZE

logger = logging.getLogger(__name__)

# Determine if we're using PostgreSQL (supports both postgresql:// and postgres:// schemes)
is_postgresql = DATABASE_URL.startswith(("postgresql://", "postgres://"))

try:
    # Configure connection arguments based on database type
    if is_postgresql:
        # PostgreSQL configuration with SSL support
        connect_args = {
            "sslmode": "require",  # Enforce SSL for security
        }

        engine = create_engine(
            DATABASE_URL,
            echo=DATABASE_ECHO,
            connect_args=connect_args,
            pool_pre_ping=True,  # Verify connections before using
            pool_size=DB_POOL_SIZE,
            max_overflow=DB_MAX_OVERFLOW,
        )
        logger.info(
            "PostgreSQL engine created (pool_size=%d, max_overflow=%d)",
            DB_POOL_SIZE,
            DB_MAX_OVERFLOW,
        )
    else:
        # SQLite configuration
        connect_args = {
            "check_same_thread": False,  # Needed for SQLite
            "timeout": 30,  # Set timeout for SQLite
        }
        engine = create_engine(
            DATABASE_URL,
            echo=DATABASE_ECHO,
            connect_args=connect_args,
        )
        logger.info("SQLite engine created")

        # Enable foreign key support for SQLite only
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
except Exception as e:
    logger.error("Failed to create database engine: %s", e)
    raise RuntimeError(f"Database configuration error: {e}") from e


def create_db_and_tables():
    """Create tables directly from SQLModel metadata.

    Kept for tests that use ephemeral in-memory SQLite engines where running
    the full Alembic migration chain would be overkill. Production and dev
    paths should use :func:`run_migrations` instead.
    """
    try:
        SQLModel.metadata.create_all(engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error("Failed to create database tables: %s", e)
        raise


def run_migrations() -> None:
    """Apply Alembic migrations up to head against the configured DATABASE_URL.

    Locates alembic.ini next to the api/ package root. Idempotent — if the
    DB is already at head, this is a fast no-op.

    One-time migration path: if the DB has tables but no ``alembic_version``
    table (the legacy ``create_db_and_tables()`` path left it that way), we
    stamp the baseline revision first. Without this, ``upgrade head`` would
    try to ``CREATE TABLE`` on tables that already exist and crash at boot.
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        from alembic import command
    except ImportError as exc:  # pragma: no cover - hard dependency
        raise RuntimeError("Alembic is not installed; cannot run migrations") from exc

    # api/app/core/database.py -> parents[2] == api/
    alembic_ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    if not alembic_ini.exists():
        raise RuntimeError(f"alembic.ini not found at {alembic_ini}")

    # env.py reads DATABASE_URL from app.core.config and sets it on the config,
    # so we don't need to set sqlalchemy.url here.
    cfg = Config(str(alembic_ini))

    # Inspect the DB alembic will actually target via env.py (same source:
    # app.core.config.DATABASE_URL). A dedicated short-lived engine avoids
    # divergence with the module-level engine if a caller patches DATABASE_URL
    # for tests.
    inspect_engine = create_engine(DATABASE_URL)
    try:
        existing_tables = set(sa_inspect(inspect_engine).get_table_names())
    finally:
        inspect_engine.dispose()

    if existing_tables and "alembic_version" not in existing_tables:
        bases = ScriptDirectory.from_config(cfg).get_bases()
        if len(bases) != 1:
            raise RuntimeError(
                f"Expected exactly one base revision for auto-stamp, got {len(bases)}: "
                f"{bases}. Refusing to guess which root to stamp."
            )
        baseline = bases[0]
        logger.info(
            "Pre-Alembic DB detected (%d tables, no alembic_version) — "
            "stamping baseline %s",
            len(existing_tables),
            baseline,
        )
        command.stamp(cfg, baseline)

    logger.info("Applying database migrations...")
    command.upgrade(cfg, "head")
    logger.info("Database migrations applied")


def verify_connection():
    """Verify database connection is working"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection verified")
        return True
    except Exception as e:
        logger.error("Database connection failed: %s", e)
        return False


# Money columns that must never be stored as Float. The baseline migration
# created these as Float; migration 31e82415610a converts them to Numeric.
# Keeping the list in one place makes it obvious what to update if the
# schema grows new ledger columns.
_MONEY_COLUMNS: dict[str, tuple[str, ...]] = {
    "transaction": (
        "quantity",
        "price_per_share",
        "fee",
        "total_amount",
        "eur_amount",
        "split_ratio",
        "fx_rate",
    ),
    "historical_prices": ("price",),
    "fx_rates": ("usd_to_eur_rate",),
}


def verify_money_columns_are_decimal(target_engine: Engine | None = None) -> None:
    """Raise ``RuntimeError`` if any money column is still declared as Float.

    Defense-in-depth startup guard. Under normal operation ``run_migrations``
    upgrades the schema to Numeric before this runs, so the check is a fast
    no-op. It only fires when someone bypasses migrations — e.g., by using
    ``create_db_and_tables`` against an old model revision or restoring a
    pre-migration database backup — and catches the condition before the app
    starts accepting writes that would otherwise drift in IEEE-754.

    Missing tables are ignored (an empty DB will be populated by migrations).
    """
    inspector = sa_inspect(target_engine if target_engine is not None else engine)
    existing_tables = set(inspector.get_table_names())

    violations: list[str] = []
    for table, money_columns in _MONEY_COLUMNS.items():
        if table not in existing_tables:
            continue
        columns_by_name = {c["name"]: c for c in inspector.get_columns(table)}
        for col_name in money_columns:
            col = columns_by_name.get(col_name)
            if col is None:
                continue
            if isinstance(col["type"], sa.Float):
                violations.append(f"{table}.{col_name}")

    if not violations:
        return

    raise RuntimeError(
        "Money columns are still declared as Float: "
        f"{', '.join(violations)}. This indicates the database has not been "
        "migrated to the Decimal schema. Run `alembic upgrade head` (or "
        "restart the app, which runs migrations automatically) before "
        "accepting any writes — otherwise monetary values will accumulate "
        "IEEE-754 drift."
    )


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session"""
    with Session(engine) as session:
        yield session

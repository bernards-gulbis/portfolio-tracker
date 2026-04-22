"""Alembic environment script.

Wires Alembic to the application's DATABASE_URL (read from env via
`app.core.config`) and uses `SQLModel.metadata` as the autogenerate target.
Imports `app.models` so every table registers before autogenerate runs.
"""

import sys
from logging.config import fileConfig
from pathlib import Path

# Make `app.*` importable when alembic runs from the `api/` directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from alembic import context

# Import models so their tables register on SQLModel.metadata.
from app import models  # noqa: F401
from app.core.config import DATABASE_URL

config = context.config

# Override sqlalchemy.url from the application's validated config.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without a live DB)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url is not None and url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

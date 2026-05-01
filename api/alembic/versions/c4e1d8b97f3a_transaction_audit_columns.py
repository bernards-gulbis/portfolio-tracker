"""transaction_audit_columns

Revision ID: c4e1d8b97f3a
Revises: b8f3c4d5e7a2
Create Date: 2026-05-01 21:00:00.000000

Adds audit columns to ``transaction``:

* ``created_at`` — when the row was written to the ledger. Backfilled from
  ``date`` for pre-existing rows so the audit log has a sensible value
  rather than NULL or "now"; subsequent inserts get the Python-side default
  (``datetime.now(UTC)``).
* ``updated_at`` — stamped on every update via the repository layer.
  Nullable; never set on insert.
* ``deleted_at`` — soft-delete marker. Repository queries filter
  ``deleted_at IS NULL`` by default; calculations (portfolio status,
  performance, exports, dedup) only see live rows.

Idempotent: a fresh DB created via ``SQLModel.metadata.create_all`` will
already have these columns from the model. The migration short-circuits
when the columns are present.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e1d8b97f3a"
down_revision: str | Sequence[str] | None = "b8f3c4d5e7a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _existing_columns(bind: sa.engine.Connection, table: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {col["name"] for col in inspector.get_columns(table)}


def upgrade() -> None:
    """Add created_at / updated_at / deleted_at columns and backfill."""
    bind = op.get_bind()
    existing = _existing_columns(bind, "transaction")

    needs_created_at = "created_at" not in existing
    needs_updated_at = "updated_at" not in existing
    needs_deleted_at = "deleted_at" not in existing

    if not (needs_created_at or needs_updated_at or needs_deleted_at):
        return

    with op.batch_alter_table("transaction", schema=None) as batch_op:
        if needs_created_at:
            # Add nullable initially so the backfill UPDATE can populate
            # before we tighten the NOT NULL constraint.
            batch_op.add_column(sa.Column("created_at", sa.DateTime(), nullable=True))
        if needs_updated_at:
            batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
        if needs_deleted_at:
            batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))

    if needs_created_at:
        # Backfill: existing rows get created_at = date. The historical
        # transaction date is the closest-available proxy for when the
        # ledger first knew about the row.
        # ``transaction`` is a SQL reserved word — quote it. SQLite and
        # PostgreSQL both accept double-quoted identifiers; the rest of the
        # codebase relies on Alembic's ``batch_alter_table`` to handle the
        # quoting so this is the only place that needs it explicit.
        op.execute(
            sa.text(
                'UPDATE "transaction" SET created_at = date WHERE created_at IS NULL'
            )
        )
        with op.batch_alter_table("transaction", schema=None) as batch_op:
            batch_op.alter_column(
                "created_at",
                existing_type=sa.DateTime(),
                nullable=False,
            )

    # Indexes for common access patterns: filtering on deleted_at (default
    # repository read path) and chronological audit queries on created_at.
    if needs_deleted_at:
        op.create_index(
            "ix_transaction_deleted_at",
            "transaction",
            ["deleted_at"],
            unique=False,
        )
    if needs_created_at:
        op.create_index(
            "ix_transaction_created_at",
            "transaction",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    """Remove the audit columns."""
    bind = op.get_bind()
    existing = _existing_columns(bind, "transaction")
    inspector = sa.inspect(bind)
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("transaction")}

    if "ix_transaction_created_at" in existing_indexes:
        op.drop_index("ix_transaction_created_at", table_name="transaction")
    if "ix_transaction_deleted_at" in existing_indexes:
        op.drop_index("ix_transaction_deleted_at", table_name="transaction")

    with op.batch_alter_table("transaction", schema=None) as batch_op:
        if "deleted_at" in existing:
            batch_op.drop_column("deleted_at")
        if "updated_at" in existing:
            batch_op.drop_column("updated_at")
        if "created_at" in existing:
            batch_op.drop_column("created_at")

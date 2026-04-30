"""add_historical_price_coverage

Revision ID: b8f3c4d5e7a2
Revises: a7b9c2e1f8d4
Create Date: 2026-04-30 12:00:00.000000

Adds a coverage table that records each ``(ticker, period_start, period_end)``
interval successfully fetched from upstream. Without this, cached point rows
in ``historical_prices`` cannot prove inner-range contiguity: two prior
disjoint fetches would let a wider follow-up request silently skip the gap
between them. The service now computes the ranges to fetch as the requested
range minus the union of recorded coverage intervals.
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8f3c4d5e7a2"
down_revision: str | Sequence[str] | None = "a7b9c2e1f8d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    Idempotent: a DB created via the pre-Alembic ``create_db_and_tables()``
    path will already have the table from ``SQLModel.metadata``, so skip
    the create when it exists. Mirrors the pattern in
    ``d23090e24a6b_drop_redundant_pk_indexes``.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "historical_price_coverage" not in inspector.get_table_names():
        op.create_table(
            "historical_price_coverage",
            sa.Column("ticker", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column(
                "period_start", sqlmodel.sql.sqltypes.AutoString(), nullable=False
            ),
            sa.Column("period_end", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("ticker", "period_start", "period_end"),
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("historical_price_coverage")

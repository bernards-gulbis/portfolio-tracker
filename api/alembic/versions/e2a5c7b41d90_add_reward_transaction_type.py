"""add_reward_transaction_type

Revision ID: e2a5c7b41d90
Revises: c4e1d8b97f3a
Create Date: 2026-08-02 10:30:00.000000

Adds the ``REWARD`` transaction type — a broker refund/credit (e.g. a trade
executed at the wrong price being made good). It is money entering the account,
so it joins DEPOSIT / SELL / DIVIDEND on the positive side of
``ck_transaction_sign``.

Two things have to change for an existing database:

1. **The PostgreSQL enum type.** ``ALTER TYPE ... ADD VALUE`` is not usable
   here: ``alembic/env.py`` wraps every migration in a single transaction, and
   PostgreSQL forbids referencing a newly added enum label from within the
   transaction that added it — which the recreated CHECK constraint below does.
   The type is therefore rebuilt (rename → create → cast → drop), which is safe
   inside one transaction. On SQLite the column is a plain VARCHAR
   (``sa.Enum.create_constraint`` defaults to ``False``) and the longest member
   name is still 8 characters, so nothing to do.

2. **The sign CHECK constraint**, which enumerates every type by name and must
   grow a REWARD branch. Mirrors ``a7b9c2e1f8d4_transaction_sign_checks``.

The ``type`` column stores ``TransactionType`` enum NAMES (uppercase), per the
baseline migration's ``sa.Enum("DEPOSIT", "BUY", ...)`` declaration — not the
StrEnum *values* ("Deposit", "Buy", ...).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2a5c7b41d90"
down_revision: str | Sequence[str] | None = "c4e1d8b97f3a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_ENUM_NAME = "transactiontype"
_OLD_ENUM_VALUES = ("DEPOSIT", "BUY", "FEE", "SELL", "WITHDRAW", "SPLIT", "DIVIDEND")
_NEW_ENUM_VALUES = (*_OLD_ENUM_VALUES, "REWARD")

_SIGN_CHECK_NAME = "ck_transaction_sign"
_OLD_SIGN_CHECK_SQL = (
    "(type = 'DEPOSIT' AND total_amount > 0) OR "
    "(type = 'WITHDRAW' AND total_amount < 0) OR "
    "(type = 'BUY' AND total_amount < 0) OR "
    "(type = 'SELL' AND total_amount > 0) OR "
    "(type = 'DIVIDEND' AND total_amount > 0) OR "
    "(type = 'FEE' AND total_amount < 0) OR "
    "(type = 'SPLIT' AND total_amount = 0)"
)
_NEW_SIGN_CHECK_SQL = _OLD_SIGN_CHECK_SQL + " OR (type = 'REWARD' AND total_amount > 0)"


def _swap_pg_enum(values: tuple[str, ...]) -> None:
    """Rebuild the PostgreSQL ``transactiontype`` enum with *values*.

    No-op on any other dialect. Rename-then-recreate rather than
    ``ALTER TYPE ... ADD VALUE`` so the new labels are usable immediately —
    see the module docstring.
    """
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(f"ALTER TYPE {_ENUM_NAME} RENAME TO {_ENUM_NAME}_old")
    sa.Enum(*values, name=_ENUM_NAME).create(bind)
    op.execute(
        f'ALTER TABLE "transaction" ALTER COLUMN type TYPE {_ENUM_NAME} '
        f"USING type::text::{_ENUM_NAME}"
    )
    op.execute(f"DROP TYPE {_ENUM_NAME}_old")


def upgrade() -> None:
    """Add REWARD to the enum and to the sign-semantics CHECK constraint."""
    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.drop_constraint(_SIGN_CHECK_NAME, type_="check")
    _swap_pg_enum(_NEW_ENUM_VALUES)
    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.create_check_constraint(_SIGN_CHECK_NAME, _NEW_SIGN_CHECK_SQL)


def downgrade() -> None:
    """Remove REWARD. Refuses to run while REWARD rows exist.

    Dropping the enum label out from under live rows would either fail on a
    cast error (PostgreSQL) or leave rows the restored CHECK constraint rejects
    (SQLite). Failing loudly with a count is more useful than either, and this
    is a ledger — silently deleting the rows is not an option.
    """
    bind = op.get_bind()
    reward_rows = bind.execute(
        sa.text("SELECT COUNT(*) FROM \"transaction\" WHERE type = 'REWARD'")
    ).scalar_one()
    if reward_rows:
        raise RuntimeError(
            f"Cannot downgrade: {reward_rows} REWARD transaction(s) exist. "
            "Reclassify or delete them before downgrading past e2a5c7b41d90."
        )

    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.drop_constraint(_SIGN_CHECK_NAME, type_="check")
    _swap_pg_enum(_OLD_ENUM_VALUES)
    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.create_check_constraint(_SIGN_CHECK_NAME, _OLD_SIGN_CHECK_SQL)

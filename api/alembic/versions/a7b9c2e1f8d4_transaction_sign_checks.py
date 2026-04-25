"""transaction_sign_checks

Revision ID: a7b9c2e1f8d4
Revises: d23090e24a6b
Create Date: 2026-04-24 14:00:00.000000

Adds a CHECK constraint enforcing the ledger's sign semantics on
``transaction.total_amount``:

* DEPOSIT / SELL / DIVIDEND — money entering the account, must be > 0
* WITHDRAW / BUY / FEE    — money leaving the account, must be < 0
* SPLIT                    — no cash flow, must be exactly 0

The Pydantic ``TransactionCreate`` validator already enforces this at the
API boundary, but a CHECK constraint catches direct-SQL writes, mis-imports,
and future callers that bypass the schema — turning a silent ledger
corruption into an immediate ``IntegrityError``.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b9c2e1f8d4"
down_revision: str | Sequence[str] | None = "d23090e24a6b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_SIGN_CHECK_NAME = "ck_transaction_sign"
# The ``type`` column stores ``TransactionType`` enum NAMES (uppercase),
# per the baseline migration's ``sa.Enum("DEPOSIT", "BUY", ...)`` declaration.
# Not the StrEnum *values* ("Deposit", "Buy", ...), which is what you'd get
# if you naively read the model.
_SIGN_CHECK_SQL = (
    "(type = 'DEPOSIT' AND total_amount > 0) OR "
    "(type = 'WITHDRAW' AND total_amount < 0) OR "
    "(type = 'BUY' AND total_amount < 0) OR "
    "(type = 'SELL' AND total_amount > 0) OR "
    "(type = 'DIVIDEND' AND total_amount > 0) OR "
    "(type = 'FEE' AND total_amount < 0) OR "
    "(type = 'SPLIT' AND total_amount = 0)"
)


def upgrade() -> None:
    """Add the sign-semantics CHECK constraint."""
    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.create_check_constraint(_SIGN_CHECK_NAME, _SIGN_CHECK_SQL)


def downgrade() -> None:
    """Drop the sign-semantics CHECK constraint."""
    with op.batch_alter_table("transaction", schema=None) as batch_op:
        batch_op.drop_constraint(_SIGN_CHECK_NAME, type_="check")

"""Typed dataclasses and utility functions for portfolio calculations."""

from dataclasses import dataclass
from dataclasses import field as dc_field
from datetime import datetime
from decimal import Decimal
from typing import Literal

# Precision threshold for holdings quantity (allowing for accumulated floating-point errors)
HOLDINGS_EPSILON = Decimal("1e-6")

_ISO_DATETIME_FMT = "%Y-%m-%dT%H:%M:%S"

# Shorthand for Decimal constants
_ZERO = Decimal("0")
_ONE = Decimal("1")


# ================== Utility functions ==================


def _to_decimal(value: object) -> Decimal:
    """Convert a value to Decimal, handling None and float inputs."""
    if value is None:
        return _ZERO
    if isinstance(value, Decimal):
        return value
    # Convert float→str→Decimal to preserve the displayed value, not the binary representation
    return Decimal(str(value))


def _normalize_zero(value: Decimal) -> float:
    """Convert very small Decimal values and -0 to 0.0, otherwise return as float."""
    return 0.0 if abs(value) < HOLDINGS_EPSILON else float(value)


def _opt_float(value: Decimal | None) -> float | None:
    """Convert Optional[Decimal] to Optional[float]."""
    return float(value) if value is not None else None


def _opt_normalize(value: Decimal | None) -> float | None:
    """Normalize Optional[Decimal] to Optional[float], converting near-zero to 0.0."""
    return _normalize_zero(value) if value is not None else None


# ================== Typed internal state ==================


@dataclass
class _Holding:
    quantity: Decimal
    total_cost: Decimal
    first_buy_date: datetime


@dataclass
class _RealizedSale:
    ticker: str
    date: str
    quantity: float
    quantity_before: float
    proceeds: float
    cost_basis: float
    realized_gain: float
    first_buy_date: str


@dataclass
class _DividendReceived:
    ticker: str
    date: str
    amount: float
    amount_eur: float | None


@dataclass
class _WithdrawalFx:
    date: str
    amount: float
    amount_eur_avg: float
    amount_eur: float
    realized_fx_gain: float


@dataclass
class _Warning:
    code: str
    date: str
    params: dict[str, str]


@dataclass
class _TxState:
    """Mutable portfolio state built by replaying transactions in chronological order."""

    cash: Decimal = _ZERO
    principal: Decimal = _ZERO  # Net deposits - withdrawals in native currency
    principal_eur: Decimal = (
        _ZERO  # Net deposits - withdrawals in EUR (historical rates)
    )
    principal_eur_avg: Decimal = (
        _ZERO  # EUR principal using average cost for withdrawals
    )
    dividends: Decimal = _ZERO
    dividends_eur: Decimal = _ZERO
    realized_gains: Decimal = _ZERO
    holdings: dict[str, _Holding] = dc_field(default_factory=dict)
    realized_sales: list[_RealizedSale] = dc_field(default_factory=list)
    dividends_received: list[_DividendReceived] = dc_field(default_factory=list)
    realized_withdrawals: list[_WithdrawalFx] = dc_field(default_factory=list)
    warnings: list[_Warning] = dc_field(default_factory=list)
    usd_to_eur_fallback: float | None = None
    # Per-date historical USD→EUR rates, pre-fetched once per status calculation.
    # Used when a transaction carries neither eur_amount nor fx_rate — the
    # fallback (current rate) is only used if no historical rate is available
    # for the transaction's date.
    historical_usd_to_eur_rates: dict[str, float] = dc_field(default_factory=dict)
    # Set when the historical FX prefetch raised. Per-transaction fallback
    # warnings are suppressed in this case — the bulk ``fxRatesUnavailable``
    # warning already covers every affected transaction.
    fx_rates_unavailable: bool = False


def _lookup_historical_rate(
    historical_rates: dict[str, float], target_date_str: str
) -> float | None:
    """Return the rate for *target_date_str* or the nearest earlier date."""
    if not historical_rates:
        return None
    rate = historical_rates.get(target_date_str)
    if rate is not None:
        return rate
    earlier = sorted(
        (d for d in historical_rates if d <= target_date_str), reverse=True
    )
    if earlier:
        return historical_rates[earlier[0]]
    return None


FxSource = Literal[
    "explicit_eur",
    "explicit_fx_rate",
    "historical",
    "fallback_current",
    "none",
]


def _eur_from_tx(
    tx: object,
    total_amount: Decimal,
    usd_to_eur_fallback: float | None = None,
    historical_rates: dict[str, float] | None = None,
) -> tuple[Decimal, FxSource]:
    """Return ``(eur_equivalent, source)`` for a transaction.

    The returned ``source`` tag tells the caller which branch of the cascade
    produced the value, so it can decide whether to emit a warning:

      * ``explicit_eur`` / ``explicit_fx_rate`` — user-supplied, trusted.
      * ``historical`` — market rate on the transaction's date.
      * ``fallback_current`` — today's live rate used as a last resort. This
        is the silent-wrong-number path that Package A makes loud.
      * ``none`` — no rate available at all (returns ``Decimal('0')``).
    """
    if tx.eur_amount is not None:
        return _to_decimal(tx.eur_amount), "explicit_eur"
    if tx.fx_rate is not None and tx.fx_rate > 0:
        return total_amount / _to_decimal(tx.fx_rate), "explicit_fx_rate"
    if historical_rates and getattr(tx, "date", None) is not None:
        date_str = tx.date.strftime("%Y-%m-%d")
        rate = _lookup_historical_rate(historical_rates, date_str)
        if rate is not None:
            return total_amount * _to_decimal(rate), "historical"
    if usd_to_eur_fallback is not None:
        return total_amount * _to_decimal(usd_to_eur_fallback), "fallback_current"
    return _ZERO, "none"

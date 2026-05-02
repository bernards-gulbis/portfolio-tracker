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


# ================== EUR aggregate accumulator ==================


@dataclass
class EurAccumulator:
    """Sum of EUR-converted amounts that records when conversion was unknown.

    A single ``add(None)`` permanently flips ``value`` to ``None``: once any
    contributing transaction lacked a usable historical FX rate, the aggregate
    is no longer trustworthy and the system must surface that to the user
    rather than silently substitute a wrong number. The raw ``total`` is kept
    only for diagnostics — handlers should read ``value``.
    """

    total: Decimal = _ZERO
    incomplete_count: int = 0

    @property
    def value(self) -> Decimal | None:
        return None if self.incomplete_count > 0 else self.total

    @property
    def is_incomplete(self) -> bool:
        return self.incomplete_count > 0

    def add(self, eur: Decimal | None) -> None:
        if eur is None:
            self.incomplete_count += 1
        else:
            self.total += eur


# ================== Typed internal state ==================


@dataclass
class _Lot:
    """A single tax lot from one BUY transaction.

    Lots are kept FIFO inside ``_Holding.lots``: oldest first, so partial
    sells consume from the head. The ``cost`` field is the original
    purchase cost in the transaction's native currency — splits do not
    change it (a split adjusts ``quantity`` but the basis is unchanged).
    """

    quantity: Decimal
    cost: Decimal
    acquired_at: datetime


@dataclass
class _Holding:
    """A position in a single ticker, modeled as a FIFO queue of tax lots.

    ``quantity``, ``total_cost`` and ``first_buy_date`` are derived from
    ``lots`` so the lot queue is the single source of truth — no risk of
    aggregate fields drifting from the underlying lots.
    """

    lots: list[_Lot] = dc_field(default_factory=list)

    @property
    def quantity(self) -> Decimal:
        total = _ZERO
        for lot in self.lots:
            total += lot.quantity
        return total

    @property
    def total_cost(self) -> Decimal:
        total = _ZERO
        for lot in self.lots:
            total += lot.cost
        return total

    @property
    def first_buy_date(self) -> datetime:
        # Lots are appended in chronological order (transactions are sorted
        # before replay), so lots[0] is the earliest buy.
        return self.lots[0].acquired_at


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
    amount_eur_avg: float | None
    amount_eur: float | None
    realized_fx_gain: float | None


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
    # EUR aggregates use ``EurAccumulator`` so a missing historical FX rate
    # propagates as ``value is None`` rather than silently substituting today's
    # rate. The raw ``.total`` is kept for diagnostics but handlers should
    # read ``.value``.
    principal_eur: EurAccumulator = dc_field(default_factory=EurAccumulator)
    principal_eur_avg: EurAccumulator = dc_field(default_factory=EurAccumulator)
    dividends: Decimal = _ZERO
    dividends_eur: EurAccumulator = dc_field(default_factory=EurAccumulator)
    realized_gains: Decimal = _ZERO
    holdings: dict[str, _Holding] = dc_field(default_factory=dict)
    realized_sales: list[_RealizedSale] = dc_field(default_factory=list)
    dividends_received: list[_DividendReceived] = dc_field(default_factory=list)
    realized_withdrawals: list[_WithdrawalFx] = dc_field(default_factory=list)
    warnings: list[_Warning] = dc_field(default_factory=list)
    # Per-date historical USD→EUR rates, pre-fetched once per status calculation.
    # When a transaction carries neither eur_amount nor fx_rate, the converter
    # consults this dict; if no rate is available for the transaction's date,
    # the conversion is reported as "missing" — never silently substituted
    # with today's live rate.
    historical_usd_to_eur_rates: dict[str, float] = dc_field(default_factory=dict)
    # Set when the historical FX prefetch raised. Per-transaction "missing"
    # warnings are suppressed in this case — the bulk ``fxRatesUnavailable``
    # warning already covers every affected transaction.
    fx_rates_unavailable: bool = False
    # Transaction ids whose EUR conversion failed (no eur_amount, no fx_rate,
    # no historical rate available). Surfaced to the UI so the user can deep-link
    # into the transaction list and supply a value.
    fx_missing_tx_ids: list[int] = dc_field(default_factory=list)


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
    "missing",
]


def _eur_from_tx(
    tx: object,
    total_amount: Decimal,
    historical_rates: dict[str, float] | None = None,
) -> tuple[Decimal | None, FxSource]:
    """Return ``(eur_equivalent, source)`` for a transaction.

    The cascade is strict: once we exhaust the trusted sources (explicit
    user-supplied amount, explicit user-supplied rate, historical market rate),
    we report ``(None, "missing")`` rather than silently substitute today's
    live rate. Today's rate is *display* data; using it for historical
    valuation would let a 2-year-old deposit be repriced at a present-day FX
    level, distorting principal_eur and tax computations.

    Source tags:

      * ``explicit_eur`` / ``explicit_fx_rate`` — user-supplied, trusted.
      * ``historical`` — market rate on (or just before) the transaction's date.
      * ``missing`` — no rate available; aggregate must be marked incomplete.
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
    return None, "missing"

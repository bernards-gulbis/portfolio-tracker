import uuid
from datetime import UTC, date, datetime
from typing import Literal

from fastapi_users import schemas as fu_schemas
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import TransactionType

PriceSource = Literal["live", "last_known", "missing"]

# ================== User Schemas ==================


class UserRead(fu_schemas.BaseUser[uuid.UUID]):
    name: str | None = None
    picture: str | None = None
    oauth_providers: list[str] = Field(default_factory=list)
    tax_rate: float = 0.255


class UserCreate(fu_schemas.BaseUserCreate):
    name: str | None = None


class UserUpdate(fu_schemas.BaseUserUpdate):
    name: str | None = None
    picture: str | None = None
    tax_rate: float | None = Field(None, ge=0, le=1)


class CloseAccountRequest(BaseModel):
    password: str | None = None
    confirmation: str | None = None


# ================== Portfolio Schemas ==================


class PortfolioBase(BaseModel):
    """Base portfolio schema."""

    name: str = Field(min_length=1, max_length=255)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate portfolio name is not empty or whitespace"""
        if not v or not v.strip():
            raise ValueError("Portfolio name cannot be empty or whitespace")
        return v.strip()


class PortfolioCopy(BaseModel):
    """Schema for copying a portfolio"""

    new_name: str


class PortfolioResponse(PortfolioBase):
    """Schema for portfolio response"""

    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PortfolioWithTransactions(PortfolioResponse):
    """Schema for portfolio with transactions"""

    transactions: list["TransactionResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ================== Transaction Schemas ==================


def _validate_ticker(v: str | None) -> str | None:
    """Validate and normalize ticker symbol (alphanumeric, ``.``, ``-``)."""
    if v is None:
        return None
    v = v.strip().upper()
    if not v:
        return None
    if not all(c.isalnum() or c in ".-" for c in v):
        raise ValueError(
            "Ticker must contain only alphanumeric characters, dots, or hyphens"
        )
    return v


def _validate_split_ratio(v: float | None) -> float | None:
    """Validate split ratio is positive."""
    if v is not None and v <= 0:
        raise ValueError("Split ratio must be greater than 0")
    return v


def _validate_fee(v: float | None) -> float | None:
    """Validate fee is non-negative."""
    if v is not None and v < 0:
        raise ValueError("Fee must be positive")
    return v


class TransactionBase(BaseModel):
    """Base transaction schema"""

    date: datetime
    type: TransactionType
    ticker: str | None = Field(None, max_length=20)
    quantity: float | None = None
    price_per_share: float | None = None
    fee: float | None = None
    total_amount: float
    eur_amount: float | None = None
    split_ratio: float | None = None
    currency: str | None = Field(None, max_length=3)
    fx_rate: float | None = None

    @field_validator("date", mode="after")
    @classmethod
    def coerce_naive_to_utc(cls, v: datetime) -> datetime:
        """Naive datetimes get explicit UTC tzinfo so downstream comparisons
        with timezone-aware values don't silently reinterpret against the
        server's local clock. Aware inputs are preserved verbatim — their
        offset is semantic data the user supplied."""
        if v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v

    validate_ticker = field_validator("ticker")(_validate_ticker)
    validate_split_ratio = field_validator("split_ratio")(_validate_split_ratio)
    validate_fee = field_validator("fee")(_validate_fee)


class TransactionCreate(TransactionBase):
    """Schema for creating a transaction"""

    @model_validator(mode="after")
    def validate_total_amount_sign(self):
        """Validate total_amount has correct sign based on transaction type."""
        tx_type = self.type
        amount = self.total_amount

        if tx_type == TransactionType.SPLIT:
            if amount != 0:
                raise ValueError("Split transactions must have total_amount of 0")
        elif tx_type in (
            TransactionType.BUY,
            TransactionType.WITHDRAW,
            TransactionType.FEE,
        ):
            if amount >= 0:
                raise ValueError(
                    f"{tx_type.value} transactions must have negative total_amount (money leaving account)"
                )
        elif (
            tx_type
            in (TransactionType.DEPOSIT, TransactionType.SELL, TransactionType.DIVIDEND)
            and amount <= 0
        ):
            raise ValueError(
                f"{tx_type.value} transactions must have positive total_amount (money entering account)"
            )

        return self


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction (all fields optional)"""

    date: datetime | None = None
    type: TransactionType | None = None
    ticker: str | None = None
    quantity: float | None = None
    price_per_share: float | None = None
    fee: float | None = None
    total_amount: float | None = None
    eur_amount: float | None = None
    split_ratio: float | None = None
    currency: str | None = None
    fx_rate: float | None = None

    @field_validator("date", mode="after")
    @classmethod
    def coerce_naive_to_utc(cls, v: datetime | None) -> datetime | None:
        """Mirror ``TransactionBase.coerce_naive_to_utc`` so PUT /transactions/{id}
        has the same tz semantics as POST. Without this, updating a date with
        a naive input would store tz-ambiguous data while a fresh create
        coerces to UTC — silent asymmetry."""
        if v is None or v.tzinfo is not None:
            return v
        return v.replace(tzinfo=UTC)

    validate_ticker = field_validator("ticker")(_validate_ticker)
    validate_split_ratio = field_validator("split_ratio")(_validate_split_ratio)
    validate_fee = field_validator("fee")(_validate_fee)


class TransactionResponse(TransactionBase):
    """Schema for transaction response"""

    id: int
    portfolio_id: int
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class BulkImportResponse(BaseModel):
    """Schema for CSV bulk import response.

    When ``dry_run=True``, ``imported_count`` and ``skipped_count`` are
    projections of what *would* happen and ``transactions`` is empty —
    the un-persisted parsed rows have no DB ids, so we omit them rather
    than fake the response shape. The frontend uses these counts to show
    a confirmation dialog before re-submitting without ``dry_run``.
    """

    imported_count: int
    skipped_count: int
    transactions: list[TransactionResponse]
    dry_run: bool = False


class PaginatedTransactionResponse(BaseModel):
    """Schema for paginated transaction response"""

    transactions: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ================== Portfolio Status Schemas ==================


class HoldingResponse(BaseModel):
    """Schema for a single holding (transaction-derived only)"""

    ticker: str
    quantity: float
    average_cost: float
    total_cost: float
    first_buy_date: date

    model_config = ConfigDict(from_attributes=True)


class TransactionWarning(BaseModel):
    """Structured warning from transaction processing, for frontend i18n."""

    code: str  # i18n key suffix, e.g. "sellNotInHoldings"
    date: str  # ISO datetime YYYY-MM-DDTHH:MM:SS of the transaction
    params: dict[str, str] = Field(default_factory=dict)  # interpolation values


class RealizedSaleResponse(BaseModel):
    """Schema for a single realized sale record."""

    ticker: str
    date: str
    quantity: float
    quantity_before: float
    proceeds: float
    cost_basis: float
    realized_gain: float
    first_buy_date: str


class DividendReceivedResponse(BaseModel):
    """Schema for a single dividend payment record."""

    ticker: str
    date: str
    amount: float
    amount_eur: float | None = None


class WithdrawalFxResponse(BaseModel):
    """Schema for a single withdrawal with realized FX gain/loss.

    EUR fields are nullable: when the historical FX rate for the withdrawal
    date — or the running EUR principal — is unavailable, the EUR figures are
    reported as ``None`` rather than silently filled with today's live rate.
    """

    date: str
    amount: float  # USD withdrawal amount (positive)
    amount_eur_avg: float | None = None  # EUR cost basis at average rate
    amount_eur: float | None = None  # EUR at historical withdrawal rate
    realized_fx_gain: float | None = None  # amount_eur - amount_eur_avg


class PortfolioStatusResponse(BaseModel):
    """Schema for portfolio status (transaction-derived metrics only).

    EUR aggregates are nullable: when any contributing transaction lacks a
    usable historical FX rate (and no explicit ``eur_amount``/``fx_rate``),
    the corresponding aggregate is reported as ``None`` instead of being
    silently distorted by today's rate. ``eur_incomplete`` is the ergonomic
    OR-of-the-three for the UI; ``fx_missing_tx_ids`` lists the offending
    transactions so the UI can deep-link the user to the fix.
    """

    portfolio_id: int
    portfolio_name: str
    principal: float  # Deposits - Withdrawals
    principal_eur: float | None = None  # Sum of all eur_amount (historical rates)
    principal_eur_avg: float | None = None  # EUR principal (avg-cost for withdrawals)
    dividends: float
    dividends_eur: float | None = None  # Dividends in EUR (historical rates)
    cash: float
    holdings: list[HoldingResponse]
    holdings_cost: float  # Sum of all holdings cost basis
    realized_gains: float  # Gains/losses from sells
    realized_sales: list[RealizedSaleResponse] = Field(default_factory=list)
    dividends_received: list[DividendReceivedResponse] = Field(default_factory=list)
    realized_withdrawals: list[WithdrawalFxResponse] = Field(default_factory=list)
    capital_gains_tax_rate: (
        float  # Tax rate applied to capital gains (e.g., 0.25 for 25%)
    )
    warnings: list[TransactionWarning] = Field(
        default_factory=list
    )  # Transaction processing warnings
    usd_to_eur_rate: float | None = None  # Live USD→EUR rate; None when unavailable
    eur_incomplete: bool = False  # True when any EUR aggregate is None
    fx_missing_tx_ids: list[int] = Field(
        default_factory=list
    )  # Transaction ids needing an FX rate / EUR amount
    # Total transactions on the portfolio. Lets the UI distinguish
    # "brand-new portfolio" from "portfolio whose principal/holdings
    # net to zero" without inferring from heuristics that misfire on
    # deposit-then-withdraw or buy-then-sell-then-withdraw histories.
    transaction_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class LivePriceInfo(BaseModel):
    """Per-ticker live-price result with provenance.

    ``source`` distinguishes a fresh Yahoo Finance fetch (``live``) from a
    stale fallback pulled from the HistoricalPrice cache (``last_known``) and
    from the "no data at all" case (``missing``). ``as_of`` is the timestamp
    of the price — now for live, the cached date for last_known, None for missing.

    Invariants:
      * ``price is None`` iff ``source == 'missing'``.
      * ``as_of is None`` iff ``source == 'missing'``. A priced result always
        carries a timestamp; "missing" carries neither.
    """

    price: float | None = None
    source: PriceSource = "missing"
    as_of: datetime | None = None

    @model_validator(mode="after")
    def _source_invariants(self) -> "LivePriceInfo":
        if self.source == "missing":
            if self.price is not None:
                raise ValueError(
                    "LivePriceInfo with source='missing' must have price=None"
                )
            if self.as_of is not None:
                raise ValueError(
                    "LivePriceInfo with source='missing' must have as_of=None"
                )
        else:
            if self.price is None:
                raise ValueError(
                    f"LivePriceInfo with source='{self.source}' must have a non-None price"
                )
            if self.as_of is None:
                raise ValueError(
                    f"LivePriceInfo with source='{self.source}' must have a non-None as_of timestamp"
                )
        return self


class LivePricesResponse(BaseModel):
    """Schema for live price polling (no transaction replay)"""

    prices: dict[str, LivePriceInfo]
    usd_to_eur_rate: float | None = None
    timestamp: datetime
    # True when the upstream provider's circuit breaker is open — i.e. we
    # gave up calling Yahoo for a cooldown period. Per-ticker ``source``
    # already encodes "live" vs "last_known" vs "missing"; this flag lets
    # the UI surface a single "provider unavailable" banner rather than a
    # row of confused "missing" chips.
    provider_unavailable: bool = False


class PerformanceDataPoint(BaseModel):
    """Schema for a single performance data point"""

    date: str  # YYYY-MM-DD format
    principal: float = 0.0
    principal_eur: float | None = (
        None  # Cumulative net deposits in EUR at historical rates
    )
    current_value: float | None = None
    fx_rate: float | None = None  # Historical USD→EUR rate at this date
    return_pct: float | None = None  # Time-weighted return (TWR) %
    sp500_return_pct: float | None = None  # S&P 500 USD return % from first data point

    model_config = ConfigDict(from_attributes=True)


class PortfolioPerformanceResponse(BaseModel):
    """Schema for portfolio performance over time"""

    portfolio_id: int
    portfolio_name: str
    data_points: list[PerformanceDataPoint]
    # Tickers whose historical prices were unavailable and which were
    # therefore valued at cost basis for some or all of the series.
    # Non-empty means the chart is lying flat for those symbols.
    cost_basis_fallback_tickers: list[str] = Field(default_factory=list)
    # Transaction-replay warnings collected while reconstructing the
    # historical series (oversell, sell-of-non-held). The same data also
    # appears in ``PortfolioStatusResponse.warnings`` so the chart can flag
    # tampered historical points without polling status separately.
    warnings: list[TransactionWarning] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# ================== Health Schema ==================


class HealthResponse(BaseModel):
    """Health-check response: DB liveness plus cache and migration freshness."""

    status: Literal["healthy", "unhealthy"]
    timestamp: datetime
    version: str
    db: Literal["ok", "error"]
    price_cache_age: int | None = None
    last_fx_rate_age: int | None = None
    migrations_head: str | None = None

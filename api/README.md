# API

For setup and commands see the [main README](../README.md). Full API reference at `/docs` (auto-generated).

## Project Structure

```text
main.py                          # FastAPI app, CORS, exception handlers
app/
  core/                          # Database, auth (FastAPI Users), config, rate limit, exceptions
  models/                        # SQLModel ORM (User, Portfolio, Transaction, HistoricalPrice, OAuthAccount)
  schemas/schemas.py             # Pydantic request/response DTOs
  repositories/                  # Data access (portfolio, transaction)
  services/
    portfolio_service.py         # Orchestration (delegates to status + perf)
    portfolio_handlers.py        # Per-type transaction handlers + dispatch
    portfolio_status.py          # calculate_status orchestrator
    portfolio_perf.py            # Time-series performance
    portfolio_types.py           # TypedDict definitions
    transaction_service.py       # CRUD, CSV import/export
    health_service.py            # Health-check helpers
    prices/                      # Live + historical prices, FX, Yahoo client, circuit breaker
  routers/                       # HTTP endpoints (portfolios, transactions)
tests/                           # pytest + in-memory SQLite
alembic/                         # DB migrations
```

## Architecture

**Router -> Service -> Repository -> Model** — strict layers, dependencies flow downward only.

- Sessions injected via `Depends(get_session)`, services instantiated per-request
- Price services (`LivePriceService`, `HistoricalPriceService`, `FxRateService`) use thread-safe in-memory TTL caches backed by `HistoricalPrice` DB persistence
- All financial math uses Python `Decimal` — weighted average cost basis, 25.5% capital gains tax
- Domain exceptions bubble up to centralized handlers in `main.py`

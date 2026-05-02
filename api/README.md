# API

For setup and commands see the [main README](../README.md). Full API reference at `/docs` (auto-generated).

## Project Structure

```text
main.py                          # FastAPI app, CORS, exception handlers
app/
  core/                          # Database, auth (FastAPI Users), exceptions
  models/                        # SQLModel ORM (User, Portfolio, Transaction, HistoricalPrice)
  schemas/schemas.py             # Pydantic request/response DTOs
  repositories/                  # Data access, pagination
  services/
    portfolio_service.py         # Orchestration (delegates to status + perf)
    portfolio_handlers.py        # Per-type transaction handlers + dispatch
    portfolio_status.py          # calculate_status orchestrator
    portfolio_perf.py            # Time-series performance
    portfolio_types.py           # TypedDict definitions
    transaction_service.py       # CRUD, CSV import/export
    price_service.py             # Yahoo Finance + multi-level caching
  routers/                       # HTTP endpoints
tests/                           # pytest + in-memory SQLite
```

## Architecture

**Router -> Service -> Repository -> Model** — strict layers, dependencies flow downward only.

- Sessions injected via `Depends(get_session)`, services instantiated per-request
- `PriceService` is a singleton with thread-safe in-memory TTL + DB caches
- All financial math uses Python `Decimal` — weighted average cost basis, 25.5% capital gains tax
- Domain exceptions bubble up to centralized handlers in `main.py`

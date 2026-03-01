# API

For setup, commands, and environment variables see the [main README](../README.md).

## Project Structure

```
main.py                          # FastAPI app, CORS, security headers, exception handlers
app/
  core/
    database.py                  # Engine config, session management, SQLite/PostgreSQL detection
    exceptions.py                # PortfolioTrackerException hierarchy (6 exception types)
    auth.py                      # FastAPI Users: transports, strategies, backends, UserManager
  models/
    user.py                      # User (UUID PK, inherits FastAPI Users base)
    oauth_account.py             # OAuthAccount (provider tokens)
    portfolio.py                 # Portfolio (user_id FK)
    transaction.py               # Transaction (all fields including eur_amount, fx_rate)
    transaction_type.py          # TransactionType enum
    historical_price.py          # HistoricalPrice and FxRate (DB price cache)
  schemas/schemas.py             # Pydantic request/response DTOs
  repositories/
    portfolio_repository.py      # Queries scoped by user_id
    transaction_repository.py    # Ownership via Portfolio JOIN; paginated queries
  services/
    portfolio_service.py         # Core calculations: status, holdings, gains, tax
    transaction_service.py       # CRUD, CSV import/export, validation
    price_service.py             # Yahoo Finance with in-memory + DB caching
  routers/
    portfolios.py                # Portfolio CRUD, status, performance, copy
    transactions.py              # Two routers: portfolio-scoped + standalone
tests/test_api.py                # Integration tests with in-memory SQLite
```

## Architecture

Strict 4-layer design. Dependencies flow downward only:

**Router -> Service -> Repository -> Model**

- **Routers** (`app/routers/`) — HTTP handling, request parsing, response formatting
- **Services** (`app/services/`) — Business logic, validation, orchestration
- **Repositories** (`app/repositories/`) — Data access, SQL queries, pagination
- **Models** (`app/models/`) — ORM schema (SQLModel)
- **Schemas** (`app/schemas/schemas.py`) — Request/response DTOs (Pydantic)

Key patterns:
- Database sessions injected via `Depends(get_session)`. Services instantiated per-request; they create their own repositories.
- Domain exceptions inherit from `PortfolioTrackerException` and bubble up to centralized handlers in `main.py`.
- `PriceService` is the exception to per-request instantiation — it uses class-level caches with thread-safe locks and a 3-layer cache (in-memory TTL + DB historical + per-session).

## API Routes

Routes have no path prefix. The Vite dev server proxies `/api/*` to `localhost:8000/*` (stripping `/api`). Interactive docs at `/docs`.

### Auth (public)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /auth/register | Register with email + password |
| POST | /auth/cookie/login | Login (sets `pt_auth` httpOnly cookie) |
| POST | /auth/cookie/logout | Logout (clears cookie) |
| GET | /auth/google/authorize | Google OAuth redirect URL |
| GET | /auth/google/callback | OAuth code exchange -> cookie -> redirect |
| GET | /users/me | Current user (session probe) |

### Portfolios & Transactions (require auth)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /portfolios/ | Create portfolio |
| GET | /portfolios/ | List portfolios |
| GET | /portfolios/{id} | Get portfolio |
| PUT | /portfolios/{id} | Rename portfolio |
| DELETE | /portfolios/{id} | Delete portfolio (cascade) |
| POST | /portfolios/{id}/copy | Copy portfolio with transactions |
| GET | /portfolios/{id}/status | Holdings, gains, tax calculations |
| GET | /portfolios/{id}/performance | Time-series performance data |
| POST | /portfolios/{id}/transactions/ | Create transaction |
| GET | /portfolios/{id}/transactions | Paginated transactions |
| GET | /portfolios/{id}/transactions/export | CSV export |
| POST | /portfolios/{id}/transactions/import | CSV bulk import (5MB limit) |
| PUT | /transactions/{id} | Update transaction |
| DELETE | /transactions/{id} | Delete transaction |

## Domain Rules

- **Sign convention:** Buy/Withdraw/Fee = negative `total_amount`; Deposit/Sell/Dividend = positive; Split = 0
- **Decimal precision:** All financial calculations use Python `Decimal` in `portfolio_service.py`. Converted at the service boundary; response DTOs convert back to `float`.
- **Cost basis:** Weighted average cost with proportional removal — `cost_basis = total_cost * (sell_qty / held_qty)`
- **Tax rate:** 25.5% capital gains (`TAX_RATE = Decimal('0.255')`)
- **Holdings epsilon:** `Decimal('1e-6')` precision threshold

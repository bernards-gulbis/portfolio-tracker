# Portfolio Tracker v4

Self-hosted investment portfolio tracker for European retail investors. Multi-currency transaction recording with EUR conversion, real-time valuations via Yahoo Finance, gain/loss and 25% capital gains tax calculations, and performance charting.

## Tech Stack

**Backend (api/):** Python, FastAPI, SQLModel (SQLAlchemy + Pydantic), SQLite (dev) / PostgreSQL (prod), Pytest
**Frontend (web/):** React 18, TypeScript, Vite, TanStack Query, Axios, Recharts, Vitest

## Project Structure

```
api/
  main.py                    # FastAPI app, CORS, security headers, exception handlers, health checks
  app/
    core/
      database.py            # Engine config, session management, SQLite/PostgreSQL detection
      exceptions.py          # PortfolioTrackerException hierarchy (6 exception types)
    models/
      portfolio.py           # Portfolio model
      transaction.py         # Transaction model (all fields including eur_amount, fx_rate)
      transaction_type.py    # TransactionType enum — keep in sync with frontend
      historical_price.py    # HistoricalPrice and FxRate models (DB price cache)
    schemas/schemas.py       # Pydantic request/response DTOs, cross-field model_validators
    repositories/            # Data access layer
      portfolio_repository.py
      transaction_repository.py  # Includes paginated queries (OFFSET/LIMIT)
    services/
      portfolio_service.py   # Core calculations: status, holdings, gains, tax (largest file)
      transaction_service.py # CRUD, CSV import/export, validation
      price_service.py       # Yahoo Finance with in-memory + DB caching, thread locks
    routers/
      portfolios.py          # Portfolio CRUD, status, performance, copy
      transactions.py        # Two routers: portfolio-scoped + standalone transaction ops
  tests/test_api.py          # 48 integration tests with in-memory SQLite

web/
  src/
    api.ts                   # Axios client, all TypeScript interfaces, API functions
    App.tsx                  # Root component, QueryClient config (5min staleTime, 1 retry)
    components/              # 11 React components (views, modals, charts)
    hooks/                   # TanStack Query wrappers (usePortfolios, useTransactions, etc.)
    context/                 # PortfolioContext (active selection), ThemeContext (light/dark)
    utils/formatters.ts      # Currency, date, number formatting
    constants/pagination.ts  # Page size config (default: 20)
```

## Commands

### Backend
```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload                    # Dev server on :8000
pytest tests/test_api.py -v                  # Run tests
pytest tests/test_api.py --cov=api           # Tests with coverage
```

### Frontend
```bash
cd web
npm install
npm run dev          # Dev server on :3000 (proxies /api to :8000)
npm run build        # Production build (tsc + vite)
npm run lint         # ESLint
npm test             # Vitest
npm run test:ui      # Vitest with UI
npm run test:coverage
```

## Architecture

**Backend:** Strict layered design — **Router → Service → Repository → Model**. Three routers in `main.py`. Services per-request; `PriceService` is the exception (class-level caches). Domain exceptions bubble from services to centralized handlers in `main.py`.

**Frontend:** `api.ts` (Axios + types) → hooks (TanStack Query) → components. UI state via React Context (`PortfolioContext`, `ThemeContext`).

For implementation details, conventions, and patterns to follow when extending, see [Architectural Patterns](.claude/docs/architectural_patterns.md).

## API Routes

Backend routes have no path prefix. The Vite dev server proxies `/api/*` → `localhost:8000/*` (stripping the `/api` prefix).

| Method | Path | Purpose |
|--------|------|---------|
| POST | /portfolios/ | Create portfolio |
| GET | /portfolios/ | List portfolios |
| GET | /portfolios/{id} | Get portfolio with transactions |
| PUT | /portfolios/{id} | Rename portfolio |
| DELETE | /portfolios/{id} | Delete portfolio (cascade) |
| POST | /portfolios/{id}/copy | Copy portfolio with transactions |
| GET | /portfolios/{id}/status | Calculated metrics (holdings, gains, tax) |
| GET | /portfolios/{id}/performance | Time-series performance data |
| POST | /portfolios/{id}/transactions/ | Create transaction |
| GET | /portfolios/{id}/transactions | Paginated transactions |
| GET | /portfolios/{id}/transactions/export | CSV export |
| POST | /portfolios/{id}/transactions/import | CSV bulk import (5MB limit) |
| PUT | /transactions/{id} | Update transaction |
| DELETE | /transactions/{id} | Delete transaction |

## Domain Rules

- **Transaction types:** Deposit, Buy, Sell, Withdraw, Dividend, Fee, Split
- **Sign convention:** Buy/Withdraw/Fee = negative `total_amount`; Deposit/Sell/Dividend = positive; Split = 0
- **EUR tracking:** Every transaction can store `eur_amount`, `fx_rate`, and `currency` for multi-currency EUR-based reporting
- **Tax rate:** 25% capital gains — `TAX_RATE` constant at `api/app/services/portfolio_service.py:23`
- **Holdings epsilon:** Floating-point threshold `HOLDINGS_EPSILON = 1e-6` at `api/app/services/portfolio_service.py:20`

## Keeping Things in Sync

The `TransactionType` enum is duplicated in backend and frontend — both must match:
- **Python:** `api/app/models/transaction_type.py`
- **TypeScript:** `web/src/api.ts` (lines 5-13)

TypeScript interfaces in `api.ts` mirror Pydantic schemas in `schemas.py`. When modifying response shapes, update both.

## Environment Variables

See `api/.env.example` for all options.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | SQLite file | `sqlite:///` or `postgresql://` connection string |
| `DATABASE_ECHO` | `false` | SQL query logging (do not enable in prod) |
| `CORS_ORIGINS` | `localhost:3000,5173` | Comma-separated allowed origins |
| `DB_POOL_SIZE` | `5` | PostgreSQL connection pool size |
| `DB_MAX_OVERFLOW` | `10` | PostgreSQL max overflow connections |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `PRICE_CACHE_TTL` | `15` | Price cache TTL in minutes |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend API base URL (build-time) |


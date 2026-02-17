# Portfolio Tracker v4

Full-stack investment portfolio tracker with multi-currency support, real-time valuation, performance charts, and tax reporting.

## Tech Stack

**Backend (api/):** Python, FastAPI, SQLModel (SQLAlchemy + Pydantic), SQLite (dev) / PostgreSQL (prod), Pytest
**Frontend (web/):** React 18, TypeScript, Vite, TanStack Query, Axios, Recharts, Vitest

## Project Structure

```
api/
  main.py                  # FastAPI app, CORS, exception handlers, health checks
  app/
    core/
      database.py          # Engine config, session management (SQLite/PostgreSQL)
      exceptions.py        # Custom exception hierarchy (PortfolioTrackerException base)
    models/                # SQLModel ORM models (Portfolio, Transaction, HistoricalPrice)
    schemas/schemas.py     # Pydantic request/response DTOs with validators
    repositories/          # Data access layer (PortfolioRepository, TransactionRepository)
    services/              # Business logic layer
      portfolio_service.py # Core calculations: status, holdings, gains, tax (largest file)
      transaction_service.py # CRUD, CSV import/export, validation
      price_service.py     # Yahoo Finance integration with multi-level caching
    routers/               # API endpoint definitions
      portfolios.py        # Portfolio CRUD, status, performance, copy
      transactions.py      # Transaction CRUD, pagination, CSV import/export
  tests/test_api.py        # 17 integration tests with in-memory SQLite

web/
  src/
    api.ts                 # Axios client, all TypeScript interfaces, API functions
    App.tsx                # Root component, QueryClient config (5min staleTime)
    components/            # 13 React components (views, modals, charts)
    hooks/                 # TanStack Query wrappers (usePortfolios, useTransactions, etc.)
    context/               # PortfolioContext (active selection), ThemeContext (light/dark)
    utils/formatters.ts    # Currency, date, number formatting
    constants/pagination.ts # Page size config (default: 20)
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

## API Routes

Base path: no prefix (routers use `/portfolios` and `/transactions`)

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
| POST | /portfolios/{id}/transactions/import | CSV bulk import |
| PUT | /transactions/{id} | Update transaction |
| DELETE | /transactions/{id} | Delete transaction |

## Key Domain Concepts

- **Transaction types:** Deposit, Buy, Sell, Withdraw, Dividend, Fee, Split
- **Sign convention:** Buy/Withdraw/Fee = negative total_amount; Deposit/Sell/Dividend = positive; Split = 0
- **EUR tracking:** `eur_amount` and `fx_rate` fields enable multi-currency portfolio valuation
- **Tax rate:** 25% capital gains, defined in `api/app/services/portfolio_service.py:23`
- **Holdings epsilon:** Floating-point threshold at `api/app/services/portfolio_service.py:20`

## Environment Variables

See `api/.env.example` for all options. Key vars: `DATABASE_URL`, `CORS_ORIGINS`, `DATABASE_ECHO`

## Additional Documentation

When working on tasks related to these topics, check:

- [Architectural Patterns](.claude/docs/architectural_patterns.md) - layered architecture, repository pattern, state management, DI, error handling conventions

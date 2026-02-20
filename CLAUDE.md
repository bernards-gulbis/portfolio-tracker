# Portfolio Tracker v4

Self-hosted investment portfolio tracker for European retail investors. Multi-currency transaction recording with EUR conversion, real-time valuations via Yahoo Finance, gain/loss and 25% capital gains tax calculations, and performance charting.

## Tech Stack

**Backend (api/):** Python, FastAPI, SQLModel (SQLAlchemy + Pydantic), SQLite (dev) / PostgreSQL (prod), Pytest
**Frontend (web/):** React 18, TypeScript, Vite, TanStack Query, Axios, Recharts, shadcn/ui, Tailwind CSS v4, Vitest

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
    components/              # 11 React app components (views, modals, charts)
    components/ui/           # 22 shadcn/ui primitives (copied into repo, not a package)
    hooks/                   # TanStack Query wrappers (usePortfolios, useTransactions, etc.)
    context/                 # PortfolioContext (active selection), ThemeContext (light/dark)
    lib/utils.ts             # cn() utility — clsx + tailwind-merge
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

## UI Component System

The frontend uses **shadcn/ui** — components are copied directly into `web/src/components/ui/` and owned by this repo (not a node_modules package). Configured via `web/components.json`.

### Configuration

- **Style:** new-york
- **Base color:** neutral
- **Icons:** lucide-react
- **CSS variables:** enabled (all colors as design tokens, not hardcoded Tailwind values)
- **Path alias:** `@/` → `web/src/` (configured in `vite.config.ts`)
- **Tailwind:** v4, configured via `@theme` block in `web/src/index.css` — no `tailwind.config.js`

### Adding New Components

```bash
cd web
npx shadcn@latest add <component-name>
```

This copies the component source into `web/src/components/ui/`. Modify freely after adding.

### Available Components

| Component | File | Used in |
|-----------|------|---------|
| `Alert`, `AlertDescription` | `ui/alert.tsx` | All modals, TransactionTable, TransactionView, PortfolioList |
| `AlertDialog` + sub-components | `ui/alert-dialog.tsx` | Delete confirmations in PortfolioList, TransactionTable |
| `Badge` | `ui/badge.tsx` | Transaction type labels in TransactionTable |
| `Button` | `ui/button.tsx` | All interactive elements |
| `Calendar` | `ui/calendar.tsx` | Date picker in TransactionModal |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | `ui/card.tsx` | All view and chart components |
| `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` | `ui/chart.tsx` | PerformanceChart, HoldingsAllocationChart |
| `Dialog` + sub-components | `ui/dialog.tsx` | All modal components |
| `DropdownMenu` + sub-components | `ui/dropdown-menu.tsx` | Row action menus in PortfolioList, TransactionTable, TransactionView |
| `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyMedia`, `EmptyContent` | `ui/empty.tsx` | Empty states in PortfolioList, TransactionTable |
| `Field`, `FieldGroup`, `FieldLabel`, `FieldError`, `FieldDescription` | `ui/field.tsx` | Form fields in all modal forms |
| `Input` | `ui/input.tsx` | Text inputs in all forms |
| `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupText` | `ui/input-group.tsx` | Currency/amount fields in TransactionModal |
| `Label` | `ui/label.tsx` | Form labels |
| `Pagination` + sub-components | `ui/pagination.tsx` | TransactionTable pagination |
| `Popover`, `PopoverTrigger`, `PopoverContent` | `ui/popover.tsx` | Date picker in TransactionModal |
| `Select` + sub-components | `ui/select.tsx` | Transaction type and time fields in TransactionModal |
| `Separator` | `ui/separator.tsx` | PortfolioList, TransactionView |
| `Skeleton` | `ui/skeleton.tsx` | Loading states in all components |
| `Table` + sub-components | `ui/table.tsx` | PortfolioList, PortfolioStatusView, TransactionTable |
| `Tabs`, `TabsList`, `TabsTrigger` | `ui/tabs.tsx` | Period selector in PerformanceChart |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | `ui/tooltip.tsx` | Available, not currently used |

### Key Conventions

- **Always use shadcn components** — never raw `<button>`, `<input>`, `<table>`, `<dialog>` where a shadcn equivalent exists
- **Card structure:** `CardHeader` + `CardTitle` for the heading, then `CardContent` for the body — never put a heading element directly inside `CardContent`
- **CardAction:** use for secondary controls in a card header (e.g. tab strip, action buttons); the `CardHeader` grid positions it to the right automatically
- **Form fields:** always wrap with `Field` > `FieldGroup` > `FieldLabel` + input + `FieldError`; never raw `<label>` + `<input>`
- **Errors:** use `<Alert variant="destructive"><AlertDescription>` for inline error messages — no `alert()` calls
- **Design tokens:** use `text-muted-foreground`, `bg-muted`, `text-destructive`, `border-border`, etc. — not raw Tailwind color classes (exception: `text-green-600`/`text-red-600` for financial gain/loss indicators)
- **`cn()` utility:** always use `cn()` from `@/lib/utils` when merging classNames — never string concatenation

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


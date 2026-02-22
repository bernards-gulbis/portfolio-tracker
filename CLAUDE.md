# Portfolio Tracker v4

Self-hosted investment portfolio tracker for European retail investors. Multi-currency transaction recording with EUR conversion, real-time valuations via Yahoo Finance, gain/loss and 25.5% capital gains tax calculations, and performance charting.

## Tech Stack

**Backend (api/):** Python, FastAPI, SQLModel (SQLAlchemy + Pydantic), SQLite (dev) / PostgreSQL (prod), Pytest
**Frontend (web/):** React 18, TypeScript, Vite, TanStack Query, Axios, Recharts, shadcn/ui, Tailwind CSS v4, sonner (toasts), i18next + react-i18next (localization), Vitest

## Project Structure

```
api/
  main.py                    # FastAPI app, CORS, security headers, exception handlers, health checks
  app/
    core/
      database.py            # Engine config, session management, SQLite/PostgreSQL detection
      exceptions.py          # PortfolioTrackerException hierarchy (6 exception types)
      auth.py                # FastAPI Users config: transports, strategies, backends, UserManager
    models/
      user.py                # User model (UUID PK, inherits FastAPI Users base)
      oauth_account.py       # OAuthAccount model (linked to User, stores provider tokens)
      portfolio.py           # Portfolio model (user_id FK — portfolios are per-user)
      transaction.py         # Transaction model (all fields including eur_amount, fx_rate)
      transaction_type.py    # TransactionType enum — keep in sync with frontend
      historical_price.py    # HistoricalPrice and FxRate models (DB price cache)
    schemas/schemas.py       # Pydantic request/response DTOs; UserRead/UserCreate/UserUpdate
    repositories/            # Data access layer
      portfolio_repository.py    # All queries scoped by user_id
      transaction_repository.py  # Ownership verified via Portfolio JOIN; paginated queries
    services/
      portfolio_service.py   # Core calculations: status, holdings, gains, tax (largest file)
      transaction_service.py # CRUD, CSV import/export, validation
      price_service.py       # Yahoo Finance with in-memory + DB caching, thread locks
    routers/
      portfolios.py          # Portfolio CRUD, status, performance, copy — all require auth
      transactions.py        # Two routers: portfolio-scoped + standalone — all require auth
  tests/test_api.py          # Integration tests with in-memory SQLite

web/
  src/
    api.ts                   # Axios client (withCredentials), 401 interceptor, API functions
    App.tsx                  # Root component; QueryClient exported for AuthContext.clear()
    components/              # 13 React app components (views, modals, charts, LoginPage, LanguageSwitcher)
    components/ui/           # 23 shadcn/ui primitives (copied into repo, not a package)
    hooks/                   # TanStack Query wrappers + useLogin/useRegister/useLogout + useLocale
    context/                 # PortfolioContext, ThemeContext, AuthContext (user/status/logout)
    i18n/
      index.ts               # i18next init: LanguageDetector, supportedLngs ['en','lv'], localStorage key 'pt_language'
      i18next.d.ts           # Module augmentation — typed t() via CustomTypeOptions
      locales/en.ts          # English strings (master); exports Translation type
      locales/lv.ts          # Latvian strings typed as Translation — compiler enforces completeness
    lib/utils.ts             # cn() utility — clsx + tailwind-merge
    utils/formatters.ts      # Currency, date, number formatting; formatCurrency/formatDate accept locale param
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

**Backend:** Strict layered design — **Router → Service → Repository → Model**. Three routers in `main.py`. Services per-request; `PriceService` is the exception (class-level caches). Domain exceptions bubble from services to centralized handlers in `main.py`. Authentication via FastAPI Users with `current_active_user` dependency injected into every router endpoint.

**Frontend:** `api.ts` (Axios + types) → hooks (TanStack Query) → components. UI state via React Context (`PortfolioContext`, `ThemeContext`, `AuthContext`). Provider order: `QueryClientProvider → ThemeProvider → AuthProvider → PortfolioProvider`. `AuthContext` probes `GET /users/me` on mount to restore sessions from the httpOnly cookie.

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
| `Toaster` | `ui/sonner.tsx` | Mounted once in `App.tsx` inside `ThemeProvider`; import `toast` from `sonner` directly in hooks/components |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | `ui/tooltip.tsx` | Available, not currently used |

### Key Conventions

- **Always use shadcn components** — never raw `<button>`, `<input>`, `<table>`, `<dialog>` where a shadcn equivalent exists
- **Card structure:** `CardHeader` + `CardTitle` for the heading, then `CardContent` for the body — never put a heading element directly inside `CardContent`
- **CardAction:** use for secondary controls in a card header (e.g. tab strip, action buttons); the `CardHeader` grid positions it to the right automatically
- **Form fields:** always wrap with `Field` > `FieldGroup` > `FieldLabel` + input + `FieldError`; never raw `<label>` + `<input>`
- **Toasts:** use `toast.success(...)` / `toast.error(...)` from `sonner` for transient mutation feedback (CRUD success/failure) — call these in TanStack Query `onSuccess`/catch handlers, not in component render
- **Errors:** use `<Alert variant="destructive"><AlertDescription>` for persistent inline errors that stay visible (form root errors, query fetch failures) — not for transient mutation feedback
- **Design tokens:** use `text-muted-foreground`, `bg-muted`, `text-destructive`, `border-border`, etc. — not raw Tailwind color classes (exception: `text-green-600`/`text-red-600` for financial gain/loss indicators)
- **`cn()` utility:** always use `cn()` from `@/lib/utils` when merging classNames — never string concatenation

## API Routes

Backend routes have no path prefix. The Vite dev server proxies `/api/*` → `localhost:8000/*` (stripping the `/api` prefix).

### Auth (public)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /auth/register | Register with email + password |
| POST | /auth/cookie/login | Login → sets `pt_auth` httpOnly cookie |
| POST | /auth/cookie/logout | Logout → clears cookie |
| GET | /auth/google/authorize | Get Google OAuth redirect URL |
| GET | /auth/google/callback | OAuth code exchange → sets cookie → redirects to `FRONTEND_URL` |
| GET | /users/me | Get current user (used to probe session on app load) |

### Portfolios & Transactions (require auth cookie)

| Method | Path | Purpose |
|--------|------|---------|
| POST | /portfolios/ | Create portfolio |
| GET | /portfolios/ | List portfolios (current user only) |
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
- **Tax rate:** 25.5% capital gains — `TAX_RATE` constant at `api/app/services/portfolio_service.py:24`
- **Holdings epsilon:** Floating-point threshold `HOLDINGS_EPSILON = 1e-6` at `api/app/services/portfolio_service.py:20`

## Localization

The app supports English (`en`) and Latvian (`lv`) via **i18next + react-i18next**.

- Translation strings live in `web/src/i18n/locales/en.ts` (master) and `web/src/i18n/locales/lv.ts`.
- `lv.ts` is typed as `lv: Translation` — TypeScript catches missing or misspelled keys at compile time.
- Language is auto-detected from `localStorage` key `pt_language`, then browser `navigator.language`, falling back to `en`.
- Language switcher (`LanguageSwitcher.tsx`) is rendered in the `App.tsx` header between the theme toggle and user menu.

**Adding a new string:** add the key to both `en.ts` and `lv.ts`. TypeScript will error at compile time if `lv.ts` is missing it.

**Adding a new language:** add the locale file, import it in `i18n/index.ts`, add the BCP 47 mapping to `useLocale.ts`, and add the display name to both locale files under `language.*`.

**Formatting with locale:** always call `useLocale()` in components that use `formatCurrency`, `formatDate`, or `toLocaleDateString`, and pass the returned locale string as the last argument. This ensures currency and date output switches immediately when the user changes language.

**Validation messages** (Zod schema errors in `TransactionModal.tsx`) are kept in English only — they are at module scope where `useTranslation` is unavailable.

## Keeping Things in Sync

The `TransactionType` enum is duplicated in backend and frontend — both must match:
- **Python:** `api/app/models/transaction_type.py`
- **TypeScript:** `web/src/api.ts` (lines 5-13)

TypeScript interfaces in `api.ts` mirror Pydantic schemas in `schemas.py`. When modifying response shapes, update both.

`UserRead` (frontend: `web/src/api.ts`, backend: `api/app/schemas/schemas.py`) must stay in sync — it drives the `user` object in `AuthContext`.

Translation files `en.ts` and `lv.ts` must stay in sync — add every new UI string to both files at the same time.

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
| `SECRET_KEY` | — | JWT signing secret — **required**, generate with `secrets.token_hex(32)` |
| `OAUTH_STATE_SECRET` | — | OAuth CSRF state signing secret — **required** |
| `GOOGLE_CLIENT_ID` | `""` | Google OAuth client ID (leave empty to disable Google login) |
| `GOOGLE_CLIENT_SECRET` | `""` | Google OAuth client secret |
| `FRONTEND_URL` | `http://localhost:3000` | Post-OAuth redirect target (Google callback redirects browser here) |
| `COOKIE_SECURE` | `false` | Set `true` in production (enforces HTTPS-only for the auth cookie) |


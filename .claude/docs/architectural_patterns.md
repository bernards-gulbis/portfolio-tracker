# Architectural Patterns

Implementation details, conventions, and code-level patterns. For project overview, domain rules, API routes, and sync requirements, see [CLAUDE.md](../../CLAUDE.md).

## Backend: Layered Clean Architecture

The API follows a strict 4-layer architecture. Dependencies flow downward only: Router -> Service -> Repository -> Model.

### Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|---------------|
| Routers | `api/app/routers/` | HTTP handling, request parsing, response formatting |
| Services | `api/app/services/` | Business logic, validation, orchestration |
| Repositories | `api/app/repositories/` | Data access, SQL queries, pagination |
| Models | `api/app/models/` | ORM schema (SQLModel), relationships |
| Schemas | `api/app/schemas/schemas.py` | Request/response DTOs (Pydantic), input validation |

### Dependency Injection via FastAPI Depends

Database sessions are injected through FastAPI's `Depends()`. Routers receive a session and instantiate services with it. Services instantiate their own repositories.

**Pattern** (seen in every router endpoint):
- `api/app/routers/portfolios.py:26` - session injected via `Depends(get_session)`
- `api/app/routers/portfolios.py:29` - service instantiated with `PortfolioService(session)`
- `api/app/services/portfolio_service.py:31-33` - service creates its repositories

### Repository Pattern

Repositories encapsulate all database operations. Each has the same constructor pattern accepting a `Session`:

- `api/app/repositories/portfolio_repository.py:10-14` - PortfolioRepository
- `api/app/repositories/transaction_repository.py:10-14` - TransactionRepository

Common methods: `create`, `get_by_id`, `get_all`, `update`, `delete`, `exists`

Repositories handle commits and refreshes internally (`session.commit()` + `session.refresh()`). Bulk operations use atomic commits with rollback on failure (`api/app/repositories/transaction_repository.py:23-41`).

### Schema Separation (Request/Response DTOs)

Pydantic schemas are separate from SQLModel models. A base/create/update/response inheritance pattern is used:

- `api/app/schemas/schemas.py:9-19` - PortfolioBase with shared validation
- `api/app/schemas/schemas.py:22-24` - PortfolioCreate extends base
- `api/app/schemas/schemas.py:37-42` - PortfolioResponse adds `id`, `created_at`, uses `from_attributes=True`

Transaction schemas follow the same pattern with additional cross-field validation via `model_validator` (`api/app/schemas/schemas.py:101-122`).

### Custom Exception Hierarchy

All domain exceptions inherit from `PortfolioTrackerException` (`api/app/core/exceptions.py:6`). Each exception type has a dedicated handler in `api/main.py:95-122` that maps to appropriate HTTP status codes.

Pattern: services raise domain exceptions -> centralized handlers in main.py convert to HTTP responses. Routers never catch domain exceptions directly.

### Service Instantiation Pattern

Services are created per-request (not singletons). Each router endpoint creates a fresh service instance:

```
service = PortfolioService(session)   # portfolios.py:29
service = TransactionService(session) # transactions.py:30
```

Exception: `PriceService` uses class-level caches with thread-safe locks (`api/app/services/price_service.py:23-30`).

## Frontend: React Query + Context Architecture

### State Management Split

Two distinct state management strategies are used:

1. **Server state** (API data) - TanStack Query with custom hooks in `web/src/hooks/`
2. **UI state** (local preferences) - React Context in `web/src/context/`

### TanStack Query Hook Pattern

Every API entity has a dedicated hook file wrapping `useQuery`/`useMutation`:

- `web/src/hooks/usePortfolios.ts` - portfolio CRUD hooks
- `web/src/hooks/useTransactions.ts` - transaction CRUD + CSV hooks
- `web/src/hooks/usePortfolioStatus.ts` - portfolio status query
- `web/src/hooks/usePortfolioPerformance.ts` - performance data query

**Query key convention:** Entity name as first element, IDs/params as subsequent elements:
- `['portfolios']` - list all
- `['portfolio', portfolioId]` - single portfolio
- `['transactions', portfolioId, page, pageSize]` - paginated transactions
- `['portfolioStatus', portfolioId]` - status data
- `['portfolioPerformance', portfolioId]` - performance chart data

**Mutation invalidation pattern:** Every mutation's `onSuccess` invalidates related query keys. Transaction mutations invalidate `transactions`, `portfolio`, and `portfolioStatus` keys for the affected portfolio (`web/src/hooks/useTransactions.ts:49-53`).

### Context Provider Pattern

Context providers follow a consistent pattern (`web/src/context/PortfolioContext.tsx`, `web/src/context/ThemeContext.tsx`):

1. Define interface for context value
2. Create context with `undefined` default
3. Export `Provider` component with state
4. Export custom hook (`usePortfolioContext`, `useTheme`) that throws if used outside provider

Provider nesting order in `web/src/App.tsx:57-63`: QueryClientProvider -> ThemeProvider -> PortfolioProvider

### API Client Architecture

All API communication flows through a single Axios instance configured in `web/src/api.ts:148-153`. This file also serves as the single source of truth for all TypeScript interfaces matching backend schemas.

Pattern: `api.ts` exports typed async functions (one per endpoint), hooks import and wrap them, components use hooks.

### Component Organization

- **View components** compose layout and business logic (TransactionView, PortfolioStatusView)
- **Modal components** handle CRUD forms (TransactionModal, CreatePortfolioModal, etc.)
- **Chart components** handle visualization (PerformanceChart, HoldingsAllocationChart)

### QueryClient Configuration

Global defaults set in `web/src/App.tsx:12-19`:
- `staleTime: 5 minutes` - reduces unnecessary refetches
- `retry: 1` - single retry on failure

## Cross-Cutting Patterns

### Pagination

Server-side pagination is implemented in `api/app/repositories/transaction_repository.py:52-68` using SQL OFFSET/LIMIT. The frontend default page size is 20 (`web/src/constants/pagination.ts`). The API validates `page_size` between 1-100 (`api/app/routers/transactions.py:51`).

### Multi-Level Caching (Price Service)

Stock prices use three cache layers:
1. **In-memory class-level cache** with 15-min TTL and thread locks (`api/app/services/price_service.py:23-25`)
2. **Database cache** via HistoricalPrice/FxRate models for historical data
3. **Session cache** cleared per-request to avoid stale data within a calculation

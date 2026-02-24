# Web

For setup, commands, and environment variables see the [main README](../README.md).

## Project Structure

```
src/
  api.ts                         # Axios client, 401 interceptor, API functions, TS interfaces
  App.tsx                        # Root component; QueryClient exported for AuthContext
  main.tsx                       # Entry point, i18n init
  components/                    # App components (views, modals, charts, LoginPage)
  components/ui/                 # shadcn/ui primitives (copied source, not a package)
  hooks/                         # TanStack Query wrappers + auth hooks + useLocale
  context/                       # PortfolioContext, ThemeContext, AuthContext
  i18n/
    index.ts                     # i18next init
    i18next.d.ts                 # Module augmentation for typed t()
    locales/en.ts                # English strings (master); exports Translation type
    locales/lv.ts                # Latvian strings (typed as Translation)
  lib/utils.ts                   # cn() utility (clsx + tailwind-merge)
  utils/formatters.ts            # Locale-aware currency, date, number formatting
  constants/pagination.ts        # Page size config (default: 20)
```

## Architecture

### Data Flow

```
api.ts (Axios + types) -> hooks (TanStack Query) -> components
```

### State Management

- **Server state** — TanStack Query hooks in `hooks/`
- **UI state** — React Context in `context/`
- Provider order in `App.tsx`: `QueryClientProvider -> ThemeProvider -> AuthProvider -> PortfolioProvider`

### Authentication

- `AuthContext` probes `GET /users/me` on mount to restore sessions from the `pt_auth` httpOnly cookie
- Axios 401 interceptor dispatches `auth:logout` CustomEvent to clear state on session expiry

### Component Organization

- **View components** — layout and business logic (TransactionView, PortfolioStatusView)
- **Modal components** — CRUD forms (TransactionModal, CreatePortfolioModal)
- **Chart components** — visualization (PerformanceChart, HoldingsAllocationChart)

### Query Keys

| Key | Purpose |
|-----|---------|
| `['portfolios']` | List all |
| `['portfolio', id]` | Single portfolio |
| `['transactions', portfolioId, page, pageSize]` | Paginated transactions |
| `['portfolioStatus', portfolioId]` | Status/metrics |
| `['portfolioPerformance', portfolioId]` | Performance chart |

Mutations invalidate related keys on success.

## shadcn/ui

Components are copied into `src/components/ui/` and owned by this repo. Config: new-york style, neutral base color, lucide-react icons, CSS variables for design tokens, Tailwind v4 via `@theme` in `src/index.css`.

```bash
npx shadcn@latest add <component-name>   # Add new components
```

### Conventions

- Use shadcn components over raw HTML elements
- `CardHeader` + `CardTitle` for headings, `CardContent` for body
- Form fields: `Field` > `FieldGroup` > `FieldLabel` + input + `FieldError`
- `toast.success()`/`toast.error()` from `sonner` for transient feedback
- `Alert variant="destructive"` for persistent inline errors
- Semantic design tokens (`text-muted-foreground`, `bg-muted`) not raw colors
- Always use `cn()` from `@/lib/utils` for class merging

## Localization

English (`en`) and Latvian (`lv`) via i18next. `lv.ts` is typed as `Translation` — missing keys are compile errors.

- Add new strings to both `en.ts` and `lv.ts`
- Use `useLocale()` hook and pass locale to `formatCurrency`/`formatDate`

**Adding a new language:** create locale file in `src/i18n/locales/`, import in `index.ts`, add BCP 47 mapping in `useLocale.ts`, add display name to both existing locale files.

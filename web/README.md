# Web

For setup and commands see the [main README](../README.md).

## Project Structure

```text
src/
  api.ts                         # Axios client, API functions, TS interfaces
  App.tsx                        # Provider tree, layout, routing
  components/                    # Views, modals, charts
  components/ui/                 # shadcn/ui primitives (copied source)
  hooks/                         # TanStack Query wrappers, auth, currency, locale
  context/                       # Auth, Currency, Navigation, Theme
  i18n/                          # i18next — en.ts (master) + lv.ts (typed)
  utils/                         # Formatters, EUR metrics, performance calc
  constants/                     # App config, pagination
```

## Architecture

```text
api.ts (Axios) -> hooks (TanStack Query) -> components (React Context for UI state)
```

Providers: `QueryClientProvider -> ThemeProvider -> CurrencyProvider -> AuthProvider -> NavigationProvider`

shadcn/ui copied into `components/ui/` — new-york style, Tailwind v4. Add with `npx shadcn@latest add <name>`.

Localization: English + Latvian via i18next. `lv.ts` typed as `Translation` — missing keys are compile errors.

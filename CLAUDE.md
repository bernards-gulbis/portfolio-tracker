# Claude.md

Green-field project — structure can be changed freely. Use shadcn components for UI. Run and add unit tests. Run build and lint, fix any errors.

## Lint & format commands

- **Backend**: `cd api && ruff check . && ruff format --check .` (auto-fix: `ruff check --fix . && ruff format .`)
- **Frontend**: `cd web && npm run lint`
- **Tests**: `cd api && python -m pytest tests/ -x -q` | `cd web && npx vitest run`

## Code style

- **`globalThis.window`** over bare `window`: use `globalThis.window === undefined` not `typeof window === 'undefined'`
- **No nested React components**: never define components or return JSX inside another component's body or inline in props. Extract to top-level components or factory functions.
- **No negated ternaries**: use `x == null ? null : value` not `x != null ? value : null`

## Known gotchas

- **Recharts + React 19 Fragments**: `react-is@17` can't detect React 19 Fragments, so recharts `toArray` silently drops children wrapped in `<>...</>`. Use individual `{condition && <Component />}` expressions instead.

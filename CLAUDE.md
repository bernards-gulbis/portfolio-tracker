# Claude.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

This is a green-field project (not shipped no real users or data) so structure can be changed.
For UI elements use shadcn components.
Run unittests and add new ones.

## Code style

### Prefer `globalThis.window` over bare `window`
Use `typeof globalThis.window === 'undefined'` instead of `typeof window === 'undefined'`. This is consistent with how we already use `globalThis.matchMedia` and avoids direct global references.

### No negated conditions in ternaries
Use `x == null ? null : value` instead of `x != null ? value : null`. The linter flags negated conditions (`!=`, `!==`) in ternaries. Always put the positive/equality check first.

## Known gotchas

### Recharts + React 19: no Fragment wrappers inside charts
`react-is@18` (bundled with recharts) cannot detect React 19 Fragment elements (`$$typeof` changed from `Symbol(react.element)` to `Symbol(react.transitional.element)`). Recharts' `toArray` uses `isFragment` to flatten Fragments — when it fails, child components (Line, Area, etc.) inside Fragments are invisible to the chart.

**Do not** wrap recharts children in `<>...</>`. Use individual `{condition && <Component />}` expressions instead.
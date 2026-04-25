# Claude.md

Green-field project — structure can be changed freely. Use shadcn components for UI. Add unit tests. After the main task is done, run `/verify-api` and `/verify-web` agents to check build, lint, and tests.

## Known gotchas

- **No negated `if/else`**: when an `if` has an `else`, lead with the positive form (`if (x)`, `if (x == null)`) — not `if (!x)` or `if (x != null)`. Applies to the top-level test only; compound expressions with `!==`/`!=` inside `&&`/`||` are fine.

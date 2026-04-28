# Claude.md

Green-field project — structure can be changed freely. Use shadcn components for UI. Add unit tests. After the main task is done, run `/verify-all` to check build, lint, tests, and i18n parity.

End-to-end (Playwright) tests are not part of `/verify-all`. Run `npm run e2e` manually when needed — it wipes the dev database.

## Known gotchas

- **No negated `if/else`**: when an `if` has an `else`, lead with the positive form (`if (x)`, `if (x == null)`) — not `if (!x)` or `if (x != null)`. Applies to the top-level test only; compound expressions with `!==`/`!=` inside `&&`/`||` are fine.
- **Use `globalThis.window`** over bare `window` in web code.
- **No nested React components** — never define components inside another component's body.
- **No negated ternaries** — write `x == null ? null : value`, not `x != null ? value : null`.

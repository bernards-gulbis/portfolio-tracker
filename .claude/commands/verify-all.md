---
description: Run verify-api and verify-web in parallel, fixing issues and reporting a combined summary.
allowed-tools: Agent
---

Dispatch the `verify-api` and `verify-web` agents **in parallel** — both Agent tool calls in a single message — then consolidate their reports.

## How to dispatch

Send one message containing two Agent tool uses:

1. `Agent(subagent_type: "verify-api", description: "Verify backend", prompt: "Run all your checks. Fix any issues you find and re-run until clean. Return your standard summary table.")`
2. `Agent(subagent_type: "verify-web", description: "Verify frontend", prompt: "Run all your checks. Fix any issues you find and re-run until clean. Return your standard summary table.")`

Do not run any of these checks yourself — the subagents own that work.

i18n parity is enforced by a vitest test (`web/src/test/i18n.parity.test.ts`) and runs as part of `verify-web` — no separate agent is needed.

## After both return

Print a single consolidated summary in this format:

```
## verify-all results

### Backend (verify-api)
<paste agent's summary table>

### Frontend (verify-web)
<paste agent's summary table>

### Overall: PASS | FAIL
```

Overall is `PASS` only if both agents report all checks green. If either verify agent failed and could not fix it, list the unresolved items under an **Unresolved** section and stop — do not attempt to fix them yourself in this command's flow.

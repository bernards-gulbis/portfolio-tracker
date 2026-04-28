---
description: Run verify-api, verify-web, and i18n-check in parallel, fixing issues and reporting a combined summary.
allowed-tools: Agent
---

Dispatch the `verify-api`, `verify-web`, and `i18n-check` agents **in parallel** — all three Agent tool calls in a single message — then consolidate their reports.

## How to dispatch

Send one message containing three Agent tool uses:

1. `Agent(subagent_type: "verify-api", description: "Verify backend", prompt: "Run all your checks. Fix any issues you find and re-run until clean. Return your standard summary table.")`
2. `Agent(subagent_type: "verify-web", description: "Verify frontend", prompt: "Run all your checks. Fix any issues you find and re-run until clean. Return your standard summary table.")`
3. `Agent(subagent_type: "i18n-check", description: "Check i18n parity", prompt: "Run your parity check on en.ts and lv.ts and return your standard report.")`

Do not run any of these checks yourself — the subagents own that work.

## After all three return

Print a single consolidated summary in this format:

```
## verify-all results

### Backend (verify-api)
<paste agent's summary table>

### Frontend (verify-web)
<paste agent's summary table>

### i18n (i18n-check)
<paste agent's parity report>

### Overall: PASS | FAIL
```

Overall is `PASS` only if `verify-api` and `verify-web` report all checks green. **`i18n-check` does not affect overall status** — its `WARN` is informational. If either verify agent failed and could not fix it, list the unresolved items under an **Unresolved** section and stop — do not attempt to fix them yourself in this command's flow.

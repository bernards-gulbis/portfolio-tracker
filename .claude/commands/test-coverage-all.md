---
description: Run test-coverage-api and test-coverage-web in parallel, then report a combined summary.
allowed-tools: Agent
---

Dispatch the `test-coverage-api` and `test-coverage-web` agents **in parallel** — both Agent tool calls in a single message — then consolidate their reports.

## How to dispatch

Send one message containing two Agent tool uses:

1. `Agent(subagent_type: "test-coverage-api", description: "Backend coverage", prompt: "Run your full coverage workflow: measure, clean up outdated/duplicate tests, fill the biggest gaps, and verify the suite still passes. Return your standard summary (coverage before/after, tests removed, tests added, status).")`
2. `Agent(subagent_type: "test-coverage-web", description: "Frontend coverage", prompt: "Run your full coverage workflow: measure, clean up outdated/duplicate tests, fill the biggest gaps, and verify the suite still passes. Return your standard summary (coverage before/after, tests removed, tests added, status).")`

Do not run the coverage workflow yourself — the subagents own that work.

## After both return

Print a single consolidated summary in this format:

```
## test-coverage-all results

### Backend (test-coverage-api)
- Coverage: <before>% → <after>%
- Tests removed: <count>
- Tests added: <count>
- Status: PASS | FAIL
<paste agent's detailed lists>

### Frontend (test-coverage-web)
- Coverage: <before>% → <after>%
- Tests removed: <count>
- Tests added: <count>
- Status: PASS | FAIL
<paste agent's detailed lists>

### Overall: PASS | FAIL
```

Overall is `PASS` only if both agents report a passing suite at the end. If either left items for manual review, list them under an **Unresolved / for manual review** section. Do not write or modify tests yourself in this command's flow — that's the subagents' job.

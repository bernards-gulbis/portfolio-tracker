# Claude.md

Green-field project — structure can be changed freely. Use shadcn components for UI. Add unit tests. After the main task is done, run the `/verify` agent to check build, lint, and tests across both web and api.

## Known gotchas

- **Recharts + React 19 Fragments**: `react-is@17` can't detect React 19 Fragments, so recharts `toArray` silently drops children wrapped in `<>...</>`. Use individual `{condition && <Component />}` expressions instead.

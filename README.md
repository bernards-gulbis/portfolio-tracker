# Portfolio Tracker

Self-hosted investment portfolio tracker for European retail investors. Real-time valuations, gain/loss calculations, performance charts, and tax estimates — with automatic EUR conversion.

**FastAPI** (Python) + **React** (TypeScript) + **shadcn/ui** + Yahoo Finance live prices.

See [api/](api/README.md) and [web/](web/README.md) READMEs for architecture details.

## Getting Started

**Prerequisites:** Python 3.12+, Node.js `^22.22.2 || ^24.15.0 || >=26` (see `web/package.json` `engines`)

Node.js 20 is not supported — jsdom 30 and react-router 8 both require newer. CI builds and tests on Node.js 24.

### Backend

```bash
cd api
python -m venv venv
# Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install --require-hashes -r requirements.lock
cp .env.example .env
# Generate SECRET_KEY and OAUTH_STATE_SECRET:
python -c "import secrets; print(secrets.token_hex(32))"
uvicorn main:app --reload    # http://localhost:8000 (API docs at /docs)
```

All environment variables are documented in `api/.env.example`. Google OAuth is optional — see `.env.example` for setup.

### Frontend

```bash
cd web
npm ci
npm run dev                  # http://localhost:3000 (proxies /api to :8000)
```

## Deployment

Frontend and backend deploy together as one Vercel project. The root
`vercel.json` declares two services — `web/` (static Vite build) and `api/`
(FastAPI on the Python runtime) — and routes `/api/*` to the backend, everything
else to the SPA. In the Vercel project settings, set Framework Preset to
**Services** and Root Directory to the repository root — a project only builds
as services when the preset is set *and* `vercel.json` has a `services` key;
with either missing the block is ignored and Vercel falls back to framework
detection.

Because both are served from one origin, there is no CORS in production and the
`pt_auth` cookie stays `SameSite=Lax`. The frontend calls `/api` relatively, so
no backend URL is baked into the bundle.

The edge strips the `/api` prefix before the backend sees a request, so routes
stay mounted at their own root (`/portfolios`, `/auth/...`). Two consequences:

- `API_ROOT_PATH=/api` so `/api/docs` and the OpenAPI `servers` entry resolve.
- `OAUTH_REDIRECT_URL` must be set explicitly *if Google OAuth is enabled* — the
  app cannot reconstruct the public callback URL, and the value must also be
  registered as an Authorized redirect URI in the Google Cloud Console.

Migrations run once per build (`python -m scripts.migrate`) rather than on
startup, so no request-serving instance issues DDL. Set
`RUN_MIGRATIONS_ON_STARTUP=false` in the deployed environment; leave it at its
default locally, where startup migrations are what create the dev and e2e
schemas.

Functions run in `fra1` to sit next to the Neon database — the `iad1` default
would add a transatlantic round trip to every query.

Required Vercel environment variables: `DATABASE_URL`, `SECRET_KEY`,
`OAUTH_STATE_SECRET`, `FRONTEND_URL`, `API_ROOT_PATH=/api`, `COOKIE_SECURE=true`,
`COOKIE_SAMESITE=lax`, `RUN_MIGRATIONS_ON_STARTUP=false`, `DB_POOL_SIZE=2`,
`DB_MAX_OVERFLOW=3`.

Only when Google login is enabled: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`OAUTH_REDIRECT_URL`. Leave all three unset to run with email/password login
alone. All variables are documented in `api/.env.example`.

Preview deployments run the build command too, so give the Preview environment
its own database (a Neon branch) and set both `DATABASE_URL` and
`PREVIEW_DATABASE_URL` to it, scoped to Preview. The migration step refuses to
run when `VERCEL_ENV=preview` and those two disagree — otherwise a preview build
would inherit production's `DATABASE_URL` and migrate it.

## Tests & Linting

```bash
cd api && python -m pytest tests/ -x -q       # Backend tests
cd web && npx vitest run                       # Frontend tests
cd api && ruff check . && ruff format --check .  # Backend lint
cd web && npm run lint                           # Frontend lint
```

## API Type Generation

`web/src/api-generated.ts` is generated from the FastAPI OpenAPI schema and committed to git. After changing any backend Pydantic schema or route, regenerate:

```bash
cd web && npm run generate:api
```

CI fails the build if `api-generated.ts` is out of date — backend changes must come with regenerated frontend types.

## Dependency Locks

Both stacks use hash-pinned lockfiles (committed to git) for reproducible installs:

- **Frontend** — `web/package-lock.json` (`npm ci` reads it).
- **Backend** — `api/requirements.lock`, generated from `api/requirements.txt` via `pip-compile --generate-hashes --output-file=requirements.lock requirements.txt`. Install with `pip install --require-hashes -r requirements.lock`. After editing `requirements.txt`, regenerate the lock and commit both files.

## CSV Import Format

```csv
date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
2/12/2020 20:14:39,Deposit,,,,,3000,2760.27,,USD,1.0871
01/16/2024 14:30:00,Buy,AAPL,10,150.00,1.00,-1501.00,,,,
01/17/2024 09:00:00,Sell,MSFT,5,380.25,0.50,1900.75,,,,
01/18/2024 11:00:00,Dividend,AAPL,,,0.00,50.00,,,,
```

Types: `Deposit`, `Buy`, `Sell`, `Withdraw`, `Dividend`, `Fee`, `Split`, `Reward`. The importer is sign-agnostic — `total_amount` and `eur` signs are automatically corrected based on transaction type (Buy/Withdraw/Fee → negative, Deposit/Sell/Dividend → positive, Split → 0). Leave fields blank if not applicable.

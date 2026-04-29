# Portfolio Tracker

Self-hosted investment portfolio tracker for European retail investors. Real-time valuations, gain/loss calculations, performance charts, and tax estimates — with automatic EUR conversion.

**FastAPI** (Python) + **React** (TypeScript) + **shadcn/ui** + Yahoo Finance live prices.

See [api/](api/README.md) and [web/](web/README.md) READMEs for architecture details.

## Getting Started

**Prerequisites:** Python 3.12+, Node.js 20+

### Backend

```bash
cd api
python -m venv venv
# Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Generate SECRET_KEY and OAUTH_STATE_SECRET:
python -c "import secrets; print(secrets.token_hex(32))"
uvicorn main:app --reload    # http://localhost:8000 (API docs at /docs)
```

All environment variables are documented in `api/.env.example`. Google OAuth is optional — see `.env.example` for setup.

### Frontend

```bash
cd web
npm install
npm run dev                  # http://localhost:3000 (proxies /api to :8000)
```

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

## CSV Import Format

```csv
date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
2/12/2020 20:14:39,Deposit,,,,,3000,2760.27,,USD,1.0871
01/16/2024 14:30:00,Buy,AAPL,10,150.00,1.00,-1501.00,,,,
01/17/2024 09:00:00,Sell,MSFT,5,380.25,0.50,1900.75,,,,
01/18/2024 11:00:00,Dividend,AAPL,,,0.00,50.00,,,,
```

Types: `Deposit`, `Buy`, `Sell`, `Withdraw`, `Dividend`, `Fee`, `Split`. The importer is sign-agnostic — `total_amount` and `eur` signs are automatically corrected based on transaction type (Buy/Withdraw/Fee → negative, Deposit/Sell/Dividend → positive, Split → 0). Leave fields blank if not applicable.

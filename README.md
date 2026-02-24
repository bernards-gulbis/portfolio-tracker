# Portfolio Tracker v4

A self-hosted investment portfolio tracker for European retail investors who trade in multiple currencies but report in EUR. Record all transaction types, get real-time valuations, gain/loss calculations, performance charts, and tax estimates — all with automatic EUR conversion.

Built with **FastAPI** (Python) and **React** (TypeScript). Live market prices from Yahoo Finance. UI built with shadcn/ui on Tailwind CSS v4.

See [api/README.md](api/README.md) and [web/README.md](web/README.md) for architecture and developer conventions.

## Features

- **Authentication**: Email/password and Google OAuth; httpOnly cookie sessions; per-user isolation
- **Multi-Portfolio Management**: Create, copy, and manage separate portfolios
- **Full Transaction Support**: Deposits, withdrawals, buy/sell, dividends, fees, stock splits
- **Real-Time Valuation**: Live prices via Yahoo Finance with multi-level caching
- **Multi-Currency**: Transactions in any currency with automatic EUR conversion and FX rates
- **Gain/Loss & Tax**: Realized and unrealized gains with 25.5% capital gains tax estimates
- **Performance Charts**: Time-series portfolio performance visualization
- **CSV Import/Export**: Bulk import/export transaction history
- **Localization**: English and Latvian with locale-aware currency/date formatting
- **Responsive UI**: Light/dark theme, paginated transactions, toast notifications

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd api
python -m venv venv
# Windows: venv\Scripts\activate | macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Generate the required secrets and add them to `.env`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"

SECRET_KEY=<generated-secret>
OAUTH_STATE_SECRET=<generated-secret>
```

**Google OAuth** (optional — skip to use email/password only):
1. Create an OAuth 2.0 Client ID at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `http://localhost:8000/auth/google/callback` as an Authorized Redirect URI
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `FRONTEND_URL` in `.env`

Start the server:
```bash
uvicorn main:app --reload    # http://localhost:8000 (docs at /docs)
```

All environment variables are documented in `api/.env.example`.

### Frontend

```bash
cd web
npm install
npm run dev                  # http://localhost:3000 (proxies /api to :8000)
```

## Running Tests

```bash
# Backend
pytest api/tests/test_api.py -v
pytest api/tests/test_api.py --cov=api

# Frontend (from web/)
cd web
npm test
```

## CSV Import Format

```csv
date,type,ticker,quantity,price_per_share,fee,total_amount,eur,split_ratio,currency,fx_rate
2/12/2020 20:14:39,Deposit,,,,,3000,2760.27,,USD,1.0871
01/16/2024 14:30:00,Buy,AAPL,10,150.00,1.00,-1501.00,,,,
01/17/2024 09:00:00,Sell,MSFT,5,380.25,0.50,1900.75,,,,
01/18/2024 11:00:00,Dividend,AAPL,,,0.00,50.00,,,,
01/19/2024 16:00:00,Withdraw,,,,,-1000.00,-920.00,,,
01/20/2024 10:00:00,Fee,,,,,-10.00,,,,
02/01/2024 09:30:00,Split,AAPL,,,,,0.00,,2.0,,
```

| Field | Description |
|-------|-------------|
| `date` | MM/DD/YYYY HH:MM:SS format |
| `type` | `Deposit`, `Buy`, `Sell`, `Withdraw`, `Dividend`, `Fee`, or `Split` |
| `ticker` | Stock symbol (required for Buy, Sell, Dividend, Split) |
| `quantity` | Number of shares (required for Buy, Sell) |
| `price_per_share` | Price per share (required for Buy, Sell) |
| `fee` | Transaction fee (optional) |
| `total_amount` | Signed amount: negative for Buy/Withdraw/Fee, positive for Deposit/Sell/Dividend, zero for Split |
| `eur` | EUR equivalent (optional, same sign convention) |
| `split_ratio` | Split ratio, e.g. 2.0 for 2-for-1 (required for Split) |
| `currency` | 3-letter currency code (optional) |
| `fx_rate` | Foreign exchange rate (optional) |

Leave fields blank if not applicable. Fees are stored as positive values.

## Database Schema

### User
- `id` (UUID PK), `email` (unique), `hashed_password`
- `is_active`, `is_superuser`, `is_verified`

### OAuthAccount
- `id` (UUID PK), `user_id` (FK -> User, CASCADE)
- `oauth_name`, `account_id`, `account_email`
- `access_token`, `refresh_token`, `expires_at`

### Portfolio
- `id` (auto PK), `user_id` (FK -> User, CASCADE), `name`, `created_at`

### Transaction
- `id` (auto PK), `portfolio_id` (FK -> Portfolio, CASCADE)
- `date`, `type`, `ticker`, `quantity`, `price_per_share`, `fee`
- `total_amount` (signed), `eur_amount` (signed), `split_ratio`
- `currency`, `fx_rate`

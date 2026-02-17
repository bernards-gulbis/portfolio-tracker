# Portfolio Tracker v4

A full-stack portfolio tracking application built with FastAPI and React. Track multiple investment portfolios and their transactions with an intuitive web interface.

## Features

- **Portfolio Management**: Create, view, update, delete, and copy multiple investment portfolios
- **Multi-Type Transactions**: Support for Deposits, Withdrawals, Buy/Sell stocks, Dividends, Fees, and Stock Splits
- **CSV Import/Export**: Bulk upload and download transactions via CSV format
- **Portfolio Status**: Real-time portfolio valuation with current holdings, cash balance, and realized/unrealized gains
- **Multi-Currency Support**: Track transactions in different currencies with EUR amounts and FX rates
- **Transaction History**: Paginated view with filtering and search capabilities
- **Real-time Updates**: Automatic UI updates using TanStack Query
- **Responsive Design**: Mobile-friendly interface with modern UI
- **Data Validation**: Comprehensive input validation on both frontend and backend
- **Signed Value Display**: Color-coded positive/negative amounts for easy tracking

## Getting Started

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- npm or yarn

### Backend Setup

1. Navigate to the API directory:
```bash
cd api
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. (Optional) Configure environment variables:
```bash
cp .env.example .env
# Edit .env to customize settings
```

Available environment variables:
- `DATABASE_ECHO`: Set to `true` to enable SQL query logging (default: `false`)
  - ⚠️ **Warning**: Do not enable in production as it logs all SQL queries

5. Run the development server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

API documentation is available at `http://localhost:8000/docs`

**Note:** All API endpoints are versioned under `/api/v1` prefix.

### Frontend Setup

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The web application will be available at `http://localhost:5173`

## Running Tests

### Backend Tests

```bash
# From project root
pytest api/tests/test_api.py -v

# With coverage
pytest api/tests/test_api.py --cov=api
```

### Frontend Tests

```bash
# From web directory
cd web
npm test

# Watch mode
npm test -- --watch
```

## CSV Upload Format

The CSV file must include the following headers:

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

**Field Descriptions:**
- `date`: Transaction date and time (MM/DD/YYYY HH:MM:SS format)
- `type`: Transaction type - `Deposit`, `Buy`, `Sell`, `Withdraw`, `Dividend`, `Fee`, or `Split`
- `ticker`: Stock symbol (required for Buy, Sell, Dividend, Split)
- `quantity`: Number of shares (required for Buy, Sell)
- `price_per_share`: Price per share (required for Buy, Sell)
- `fee`: Transaction fee (optional, defaults to 0)
- `total_amount`: Total transaction amount with sign:
  - **Negative** for: Buy, Withdraw, Fee (money leaving account)
  - **Positive** for: Deposit, Sell, Dividend (money entering account)
  - Zero for: Split (no cash impact)
- `eur`: EUR equivalent amount (optional, follows same sign convention as total_amount)
- `split_ratio`: Stock split ratio (required for Split transactions, e.g., 2.0 for 2-for-1 split)
- `currency`: Currency code (optional, 3-letter code, e.g., USD, EUR, GBP)
- `fx_rate`: Foreign exchange rate (optional, up to 4 decimal places)

**Notes:**
- Leave fields blank (empty) if not applicable for that transaction type
- Fees are always stored as positive values
- Total amounts use signed values to indicate cash flow direction
- Date format must match: MM/DD/YYYY HH:MM:SS

## Database Schema

### Portfolio
- `id`: Primary key (auto-increment)
- `name`: Portfolio name (required)
- `created_at`: Timestamp

### Transaction
- `id`: Primary key (auto-increment)
- `portfolio_id`: Foreign key to Portfolio (CASCADE delete)
- `date`: Transaction date and time (required)
- `type`: Transaction type - Deposit, Buy, Sell, Withdraw, Dividend, Fee, or Split (required)
- `ticker`: Stock symbol (optional, required for Buy/Sell/Dividend/Split)
- `quantity`: Number of shares (optional, required for Buy/Sell)
- `price_per_share`: Price per share (optional, required for Buy/Sell)
- `fee`: Transaction fee (optional, defaults to None)
- `total_amount`: Total transaction amount with sign (required, defaults to 0)
  - Negative for costs (Buy, Withdraw, Fee)
  - Positive for income (Deposit, Sell, Dividend)
- `eur_amount`: EUR equivalent amount (optional, follows same sign convention)
- `split_ratio`: Stock split ratio (optional, required for Split transactions)
- `currency`: Currency code (optional, 3-letter code)
- `fx_rate`: Foreign exchange rate (optional, up to 4 decimal places)

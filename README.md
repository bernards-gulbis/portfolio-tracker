# Portfolio Tracker v4

A full-stack portfolio tracking application built with FastAPI and React. Track multiple investment portfolios and their transactions with an intuitive web interface.

## Features

- **Portfolio Management**: Create, view, update, delete, and copy multiple investment portfolios
- **Multi-Type Transactions**: Support for Deposits, Withdrawals, Buy/Sell stocks, Dividends, Fees, and Stock Splits
- **CSV Import/Export**: Bulk upload and download transactions via CSV format
- **Portfolio Status**: Real-time portfolio valuation with current holdings, cash balance, and realized/unrealized gains
- **Multi-Currency Support**: Track EUR amounts alongside primary currency
- **Transaction History**: Paginated view with filtering and search capabilities
- **Real-time Updates**: Automatic UI updates using TanStack Query
- **Responsive Design**: Mobile-friendly interface with modern UI
- **Data Validation**: Comprehensive input validation on both frontend and backend
- **Signed Value Display**: Color-coded positive/negative amounts for easy tracking

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLModel**: SQL database interactions with Python type hints
- **SQLite**: Lightweight database with foreign key constraints
- **Pydantic**: Data validation using Python type annotations
- **Pytest**: Comprehensive test suite (17 tests)

### Frontend
- **React 18**: Modern UI library with hooks
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **TanStack Query**: Server state management
- **Axios**: HTTP client
- **Vitest**: Unit testing framework (12 tests)

## Project Structure

```
portfolio-tracker-v4/
├── api/                    # Backend API
│   ├── app/                # Application package
│   │   ├── core/           # Core functionality (database, exceptions)
│   │   ├── models/         # SQLModel database models
│   │   ├── schemas/        # Pydantic request/response schemas
│   │   ├── repositories/   # Data access layer (Repository pattern)
│   │   ├── services/       # Business logic layer (Service pattern)
│   │   └── routers/        # API route handlers
│   ├── tests/              # Backend tests
│   ├── main.py             # FastAPI application entry point
│   └── README.md           # API documentation
│
├── web/                    # Frontend application
│   ├── src/
│   │   ├── api.ts          # API client & TypeScript interfaces
│   │   ├── App.tsx         # Main application component
│   │   ├── components/     # React components
│   │   ├── context/        # React Context providers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Utility functions
│   │   └── test/           # Frontend tests
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

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
pip install fastapi uvicorn sqlmodel pytest httpx
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

## API Endpoints

**Base URL:** `/api/v1`

### Health Checks

- `GET /` - Basic health check
- `GET /health` - Comprehensive health check with database connectivity test

### Portfolios

- `GET /api/v1/portfolios/` - List all portfolios
- `GET /api/v1/portfolios/{id}` - Get portfolio by ID with transactions
- `POST /api/v1/portfolios/` - Create new portfolio
- `PUT /api/v1/portfolios/{id}` - Update portfolio name
- `DELETE /api/v1/portfolios/{id}` - Delete portfolio (cascades to transactions)
- `POST /api/v1/portfolios/{id}/copy` - Copy portfolio with all transactions
- `GET /api/v1/portfolios/{id}/status` - Get portfolio status (holdings, cash balance, gains/losses)

### Transactions

- `GET /api/v1/portfolios/{portfolio_id}/transactions/` - List transactions for a portfolio (paginated)
- `GET /api/v1/transactions/{id}` - Get transaction by ID
- `POST /api/v1/portfolios/{portfolio_id}/transactions/` - Create new transaction
- `PUT /api/v1/transactions/{id}` - Update transaction
- `DELETE /api/v1/transactions/{id}` - Delete transaction
- `POST /api/v1/portfolios/{portfolio_id}/transactions/import` - Bulk upload via CSV
- `GET /api/v1/portfolios/{portfolio_id}/transactions/export-csv` - Export transactions to CSV

### CSV Upload Format

The CSV file must include the following headers:

```csv
date,type,ticker,quantity,price_per_share,fee,total_amount,EUR,split_ratio
01/15/2024 10:00:00,Deposit,,,,,5000.00,4600.00,
01/16/2024 14:30:00,Buy,AAPL,10,150.00,1.00,-1501.00,,
01/17/2024 09:00:00,Sell,MSFT,5,380.25,0.50,1900.75,,
01/18/2024 11:00:00,Dividend,AAPL,,,0.00,50.00,,
01/19/2024 16:00:00,Withdraw,,,,,-1000.00,-920.00,
01/20/2024 10:00:00,Fee,,,,,-10.00,,
02/01/2024 09:30:00,Split,AAPL,,,,,0.00,,2.0
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
- `EUR`: EUR equivalent amount (optional, follows same sign convention as total_amount)
- `split_ratio`: Stock split ratio (required for Split transactions, e.g., 2.0 for 2-for-1 split)

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

## Development

### Backend Development

The backend uses:
- **Clean Architecture** with layered design (routers → services → repositories)
- **Repository Pattern** for data access abstraction
- **Service Pattern** for business logic encapsulation
- **Custom Exceptions** with centralized error handling
- FastAPI's lifespan events for startup/shutdown
- SQLModel for ORM with relationships
- Foreign key constraints enabled via PRAGMA
- CORS middleware for cross-origin requests
- Dependency injection for database sessions

### Frontend Development

The frontend uses:
- React Context API for active portfolio state
- TanStack Query for server state caching
- Custom hooks for API operations
- TypeScript interfaces matching backend schemas
- Utility functions for formatting (currency, dates, colors)

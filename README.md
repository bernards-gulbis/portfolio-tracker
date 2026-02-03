# Portfolio Tracker v4

A full-stack portfolio tracking application built with FastAPI and React. Track multiple investment portfolios and their transactions with an intuitive web interface.

## Features

- **Portfolio Management**: Create, view, and delete multiple investment portfolios
- **Transaction Tracking**: Record buy/sell transactions with symbol, quantity, price, and type
- **CSV Import**: Bulk upload transactions via CSV file
- **Real-time Updates**: Automatic UI updates using TanStack Query
- **Responsive Design**: Mobile-friendly interface with modern UI
- **Data Validation**: Comprehensive input validation on both frontend and backend

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
│   ├── database.py         # Database configuration
│   ├── models.py           # SQLModel database models
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── crud.py             # CRUD operations & CSV parser
│   ├── main.py             # FastAPI application
│   └── tests/
│       └── test_api.py     # Backend tests
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

4. Run the development server:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

API documentation is available at `http://localhost:8000/docs`

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

### Portfolios

- `GET /portfolios/` - List all portfolios
- `GET /portfolios/{id}` - Get portfolio by ID
- `POST /portfolios/` - Create new portfolio
- `PUT /portfolios/{id}` - Update portfolio
- `DELETE /portfolios/{id}` - Delete portfolio (cascades to transactions)

### Transactions

- `GET /portfolios/{portfolio_id}/transactions/` - List transactions for a portfolio
- `GET /transactions/{id}` - Get transaction by ID
- `POST /transactions/` - Create new transaction
- `PUT /transactions/{id}` - Update transaction
- `DELETE /transactions/{id}` - Delete transaction
- `POST /portfolios/{portfolio_id}/transactions/upload-csv` - Bulk upload via CSV

### CSV Upload Format

```csv
symbol,quantity,price,type,date
AAPL,100,150.50,buy,2024-01-15
MSFT,50,380.25,sell,2024-01-20
```

Supported formats:
- Price can include commas (e.g., 1,500.00)
- Type: `buy` or `sell`
- Date: YYYY-MM-DD format

## Database Schema

### Portfolio
- `id`: Primary key
- `name`: Portfolio name
- `description`: Optional description
- `created_at`: Timestamp

### Transaction
- `id`: Primary key
- `portfolio_id`: Foreign key to Portfolio (CASCADE delete)
- `symbol`: Stock symbol
- `quantity`: Number of shares
- `price`: Price per share
- `type`: "buy" or "sell"
- `date`: Transaction date
- `created_at`: Timestamp

## Development

### Backend Development

The backend uses:
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

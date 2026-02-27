import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AnalyzePage } from '../components/AnalyzePage';

vi.mock('../hooks/useActivePortfolioId', () => ({
  useActivePortfolioId: vi.fn(),
}));

vi.mock('../hooks/useRealizedSales', () => ({
  useRealizedSales: vi.fn(),
}));

import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useRealizedSales } from '../hooks/useRealizedSales';
import type { RealizedSale } from '../api';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderPage = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AnalyzePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const makeSale = (overrides: Partial<RealizedSale>): RealizedSale => ({
  portfolio_id: 1,
  portfolio_name: 'Test',
  transaction_id: 1,
  date: '2023-01-01T00:00:00',
  ticker: 'AAPL',
  quantity: 10,
  sale_proceeds: 1500,
  cost_basis: 1000,
  realized_gain_loss: 500,
  realized_gain_loss_pct: 50,
  ...overrides,
});

describe('AnalyzePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useRealizedSales).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);
  });

  it('shows empty message when there are no sells', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: { sales: [], total_realized_gain_loss: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();
    expect(screen.getByText('No sell transactions found.')).toBeInTheDocument();
  });

  it('groups multiple sells of the same ticker into one row', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: {
        sales: [
          makeSale({ transaction_id: 1, ticker: 'AAPL', sale_proceeds: 1000, cost_basis: 800, realized_gain_loss: 200, realized_gain_loss_pct: 25 }),
          makeSale({ transaction_id: 2, ticker: 'AAPL', sale_proceeds: 500, cost_basis: 400, realized_gain_loss: 100, realized_gain_loss_pct: 25 }),
        ],
        total_realized_gain_loss: 300,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();

    const rows = screen.getAllByRole('row');
    // header + 1 data row (AAPL grouped)
    expect(rows).toHaveLength(2);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // sell count
  });

  it('shows separate rows for different tickers', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: {
        sales: [
          makeSale({ transaction_id: 1, ticker: 'AAPL', realized_gain_loss: 200 }),
          makeSale({ transaction_id: 2, ticker: 'MSFT', realized_gain_loss: 100 }),
        ],
        total_realized_gain_loss: 300,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('sorts by biggest gainer first', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: {
        sales: [
          makeSale({ transaction_id: 1, ticker: 'MSFT', realized_gain_loss: 100 }),
          makeSale({ transaction_id: 2, ticker: 'AAPL', realized_gain_loss: 500 }),
          makeSale({ transaction_id: 3, ticker: 'GOOG', realized_gain_loss: -50 }),
        ],
        total_realized_gain_loss: 550,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();

    const cells = screen.getAllByRole('cell');
    const tickers = cells.filter((c) => ['AAPL', 'MSFT', 'GOOG'].includes(c.textContent ?? ''));
    expect(tickers[0].textContent).toBe('AAPL');
    expect(tickers[1].textContent).toBe('MSFT');
    expect(tickers[2].textContent).toBe('GOOG');
  });

  it('computes grouped gain percentage from summed totals', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: {
        sales: [
          makeSale({ transaction_id: 1, ticker: 'AAPL', sale_proceeds: 1200, cost_basis: 1000, realized_gain_loss: 200, realized_gain_loss_pct: 20 }),
          makeSale({ transaction_id: 2, ticker: 'AAPL', sale_proceeds: 600, cost_basis: 400, realized_gain_loss: 200, realized_gain_loss_pct: 50 }),
        ],
        total_realized_gain_loss: 400,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();

    // total gain = 400, total cost_basis = 1400, pct = 400/1400*100 = 28.57%
    expect(screen.getByText(/28\.57%/)).toBeInTheDocument();
  });

  it('shows total gain/loss in header with sign prefix', () => {
    vi.mocked(useRealizedSales).mockReturnValue({
      data: {
        sales: [makeSale({ realized_gain_loss: 750, realized_gain_loss_pct: 75 })],
        total_realized_gain_loss: 750,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useRealizedSales>);

    renderPage();

    // +$750.00 appears in the header summary and in the gain cell
    expect(screen.getAllByText(/\+\$750\.00/).length).toBeGreaterThanOrEqual(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AnalyzePage } from '../components/AnalyzePage';

vi.mock('../hooks/useActivePortfolioId', () => ({
  useActivePortfolioId: vi.fn(),
}));

vi.mock('../hooks/useAggregatedSales', () => ({
  useAggregatedSales: vi.fn(),
}));

import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useAggregatedSales } from '../hooks/useAggregatedSales';
import type { AggregatedSale } from '../api';

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

const makeAggregatedSale = (overrides: Partial<AggregatedSale>): AggregatedSale => ({
  ticker: 'AAPL',
  total_gain_loss: 500,
  ...overrides,
});

describe('AnalyzePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);
  });

  it('shows empty message when there are no sells', () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: { sales: [], total_realized_gain_loss: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();
    expect(screen.getByText('No sell transactions found.')).toBeInTheDocument();
  });

  it('renders one row per aggregated ticker', () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: {
        sales: [makeAggregatedSale({ ticker: 'AAPL', total_gain_loss: 300 })],
        total_realized_gain_loss: 300,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();

    const rows = screen.getAllByRole('row');
    // header + 1 data row
    expect(rows).toHaveLength(2);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('shows separate rows for different tickers', () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: {
        sales: [
          makeAggregatedSale({ ticker: 'AAPL', total_gain_loss: 200 }),
          makeAggregatedSale({ ticker: 'MSFT', total_gain_loss: 100 }),
        ],
        total_realized_gain_loss: 300,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('renders rows in the order provided by the backend (sorted by gain desc)', () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: {
        sales: [
          makeAggregatedSale({ ticker: 'AAPL', total_gain_loss: 500 }),
          makeAggregatedSale({ ticker: 'MSFT', total_gain_loss: 100 }),
          makeAggregatedSale({ ticker: 'GOOG', total_gain_loss: -50 }),
        ],
        total_realized_gain_loss: 550,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();

    const cells = screen.getAllByRole('cell');
    const tickers = cells.filter((c) => ['AAPL', 'MSFT', 'GOOG'].includes(c.textContent ?? ''));
    expect(tickers[0].textContent).toBe('AAPL');
    expect(tickers[1].textContent).toBe('MSFT');
    expect(tickers[2].textContent).toBe('GOOG');
  });

  it('shows total gain/loss in header with sign prefix', () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: {
        sales: [makeAggregatedSale({ total_gain_loss: 750, gain_pct: 75 })],
        total_realized_gain_loss: 750,
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();

    expect(screen.getAllByText(/\+\$750\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it('passes ticker filter to hook when user types in filter input', async () => {
    vi.mocked(useAggregatedSales).mockReturnValue({
      data: { sales: [], total_realized_gain_loss: 0 },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedSales>);

    renderPage();

    const input = screen.getByPlaceholderText('Filter by ticker...');
    await userEvent.type(input, 'AAPL');

    // Hook should have been called with the uppercased ticker
    expect(vi.mocked(useAggregatedSales)).toHaveBeenCalledWith(1, 'AAPL');
  });
});

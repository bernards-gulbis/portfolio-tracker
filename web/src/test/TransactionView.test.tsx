import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TransactionView } from '../components/TransactionView';
import { useTransactions } from '../hooks/useTransactions';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { TransactionType } from '../api';

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
  useCreateTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useImportTransactionsCSV: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false, data: null }),
}));

vi.mock('../hooks/useActivePortfolioId', () => ({
  useActivePortfolioId: vi.fn(),
}));

vi.mock('../hooks/usePortfolioStatus', () => ({
  usePortfolioStatus: vi.fn().mockReturnValue({ data: { holdings: [], usd_to_eur_rate: null } }),
}));

vi.mock('../hooks/useLivePrices', () => ({
  useLivePrices: vi.fn().mockReturnValue({ data: null }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderView = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TransactionView />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('TransactionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no portfolio message when activePortfolioId is null', () => {
    vi.mocked(useActivePortfolioId).mockReturnValue(null);
    vi.mocked(useTransactions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView();
    expect(screen.getByText('No Portfolio Selected')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useTransactions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('shows error message when query fails', () => {
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useTransactions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof useTransactions>);

    renderView();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('renders transaction table when data is loaded', () => {
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: 1,
            portfolio_id: 1,
            date: '2024-01-15T10:00:00',
            type: TransactionType.DEPOSIT,
            ticker: null,
            quantity: null,
            price_per_share: null,
            fee: 0,
            total_amount: 1000,
            eur_amount: null,
            split_ratio: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Add Transaction')).toBeInTheDocument();
  });

  it('shows empty state when no transactions', () => {
    vi.mocked(useActivePortfolioId).mockReturnValue(1);
    vi.mocked(useTransactions).mockReturnValue({
      data: {
        transactions: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView();
    expect(screen.getByText('No Transactions Yet')).toBeInTheDocument();
  });
});

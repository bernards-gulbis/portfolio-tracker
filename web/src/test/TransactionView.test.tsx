import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransactionView } from '../components/TransactionView';
import { useTransactions } from '../hooks/useTransactions';
import { TransactionType, exportTransactionsCSV } from '../api';

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
  useCreateTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useImportTransactionsCSV: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false, data: null }),
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

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    exportTransactionsCSV: vi.fn(),
  };
});

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderView = (portfolioId: number | null = null) => {
  const queryClient = createTestQueryClient();
  const initialPath =
    portfolioId == null ? '/transactions' : `/portfolios/${portfolioId}/transactions`;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/portfolios/:id/transactions" element={<TransactionView />} />
          <Route path="/transactions" element={<TransactionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('TransactionView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no portfolio message when activePortfolioId is null', () => {
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
    vi.mocked(useTransactions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('shows error message when query fails', () => {
    vi.mocked(useTransactions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('renders transaction table when data is loaded', () => {
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

    renderView(1);
    screen.getAllByText('Transactions');
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Add Transaction')).toBeInTheDocument();
  });

  it('shows empty state when no transactions', () => {
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

    renderView(1);
    expect(screen.getByText('No Transactions Yet')).toBeInTheDocument();
  });

  it('opens add transaction modal when Add Transaction is clicked', async () => {
    vi.mocked(useTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
            type: TransactionType.DEPOSIT, ticker: null, quantity: null,
            price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
          },
        ],
        total: 1, page: 1, page_size: 20, total_pages: 1,
      },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    await userEvent.click(screen.getByText('Add Transaction'));
    expect(screen.getByRole('heading', { name: 'Add Transaction' })).toBeInTheDocument();
  });

  it('opens import CSV modal via actions menu', async () => {
    vi.mocked(useTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
            type: TransactionType.DEPOSIT, ticker: null, quantity: null,
            price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
          },
        ],
        total: 1, page: 1, page_size: 20, total_pages: 1,
      },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    // Open actions menu
    const actionsBtn = screen.getByLabelText('Transaction table actions menu');
    await userEvent.click(actionsBtn);

    // Click Import CSV
    await userEvent.click(await screen.findByText('Import CSV'));

    // Import modal should appear
    expect(screen.getByRole('heading', { name: /upload transactions csv/i })).toBeInTheDocument();
  });

  it('exports CSV successfully', async () => {
    const mockBlob = new Blob(['csv data'], { type: 'text/csv' });
    vi.mocked(exportTransactionsCSV).mockResolvedValueOnce(mockBlob);
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
    const mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    try {
      vi.mocked(useTransactions).mockReturnValue({
        data: {
          transactions: [
            {
              id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
              type: TransactionType.DEPOSIT, ticker: null, quantity: null,
              price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
            },
          ],
          total: 1, page: 1, page_size: 20, total_pages: 1,
        },
        isLoading: false, isFetching: false, error: null,
      } as unknown as ReturnType<typeof useTransactions>);

      renderView(1);

      // Open actions menu
      const actionsBtn = screen.getByLabelText('Transaction table actions menu');
      await userEvent.click(actionsBtn);

      // Click Export CSV
      await userEvent.click(await screen.findByText('Export CSV'));

      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(mockRevokeObjectURL).toHaveBeenCalled();
      });
    } finally {
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('shows error when export CSV fails', async () => {
    vi.mocked(exportTransactionsCSV).mockRejectedValueOnce(new Error('Export failed'));

    vi.mocked(useTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
            type: TransactionType.DEPOSIT, ticker: null, quantity: null,
            price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
          },
        ],
        total: 1, page: 1, page_size: 20, total_pages: 1,
      },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    // Open actions menu
    const actionsBtn = screen.getByLabelText('Transaction table actions menu');
    await userEvent.click(actionsBtn);

    // Click Export CSV
    await userEvent.click(await screen.findByText('Export CSV'));

    await waitFor(() => {
      expect(screen.getByText(/Export failed/)).toBeInTheDocument();
    });
  });

  it('resets to page 1 when ticker search changes', async () => {
    const transaction = {
      id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
      type: TransactionType.DEPOSIT, ticker: null, quantity: null,
      price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
    };
    vi.mocked(useTransactions).mockReturnValue({
      data: { transactions: [transaction], total: 40, page: 1, page_size: 20, total_pages: 2 },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    // Drive the component to page 2 so the page=1 reset has something observable to undo.
    await userEvent.click(screen.getByLabelText('Next page'));
    await waitFor(() => {
      expect(useTransactions).toHaveBeenLastCalledWith(1, 2, 20, undefined, undefined, 'desc', undefined, undefined);
    });

    const searchInput = screen.getByPlaceholderText('Search asset...');
    vi.mocked(useTransactions).mockClear();

    await userEvent.type(searchInput, 'AAPL');
    // useDebounce delays by 150ms; wait for debounced value to flow through.
    // Pre-reset the page was 2; assertion's page=1 proves the reset fired.
    await waitFor(
      () => {
        expect(useTransactions).toHaveBeenLastCalledWith(1, 1, 20, 'AAPL', undefined, 'desc', undefined, undefined);
      },
      { timeout: 1000 }
    );
  });

  it('resets pagination and filters to defaults when active portfolio changes', async () => {
    const transaction = {
      id: 1, portfolio_id: 1, date: '2024-01-15T10:00:00',
      type: TransactionType.DEPOSIT, ticker: null, quantity: null,
      price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
    };
    vi.mocked(useTransactions).mockReturnValue({
      data: { transactions: [transaction], total: 40, page: 1, page_size: 20, total_pages: 2 },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    // Capture useNavigate so we can switch portfolios imperatively.
    const { useNavigate } = await import('react-router-dom');
    let navigateFn: ((path: string) => void) | null = null;
    const NavigationCapture = () => {
      navigateFn = useNavigate();
      return null;
    };

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/portfolios/1/transactions']}>
          <Routes>
            <Route
              path="/portfolios/:id/transactions"
              element={
                <>
                  <NavigationCapture />
                  <TransactionView />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Drive into a non-default state: ticker filter first, then page 2.
    await userEvent.type(screen.getByPlaceholderText('Search asset...'), 'AAPL');
    await waitFor(
      () => {
        expect(useTransactions).toHaveBeenLastCalledWith(1, 1, 20, 'AAPL', undefined, 'desc', undefined, undefined);
      },
      { timeout: 1000 }
    );
    await userEvent.click(screen.getByLabelText('Next page'));
    await waitFor(() => {
      expect(useTransactions).toHaveBeenLastCalledWith(1, 2, 20, 'AAPL', undefined, 'desc', undefined, undefined);
    });

    // Switch to a different portfolio — the prev-id reset block should fire,
    // clearing page back to 1 and ticker back to undefined.
    vi.mocked(useTransactions).mockClear();
    expect(navigateFn).not.toBeNull();
    navigateFn!('/portfolios/2/transactions');

    await waitFor(
      () => {
        expect(useTransactions).toHaveBeenLastCalledWith(2, 1, 20, undefined, undefined, 'desc', undefined, undefined);
      },
      { timeout: 1000 }
    );
  });

  it('passes date_from and date_to to the transactions query', async () => {
    const transaction = {
      id: 1, portfolio_id: 1, date: '2024-02-15T10:00:00',
      type: TransactionType.DEPOSIT, ticker: null, quantity: null,
      price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
    };
    vi.mocked(useTransactions).mockReturnValue({
      data: { transactions: [transaction], total: 1, page: 1, page_size: 20, total_pages: 1 },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    const fromInput = document.getElementById('tx-date-from') as HTMLInputElement;
    const toInput = document.getElementById('tx-date-to') as HTMLInputElement;
    vi.mocked(useTransactions).mockClear();

    await userEvent.type(fromInput, '2024-02-01');
    await userEvent.type(toInput, '2024-02-28');

    await waitFor(
      () => {
        expect(useTransactions).toHaveBeenLastCalledWith(
          1, 1, 20, undefined, undefined, 'desc', '2024-02-01', '2024-02-28'
        );
      },
      { timeout: 1000 }
    );
  });

  it('skips the query and marks the to-field invalid when date range is inverted', async () => {
    const transaction = {
      id: 1, portfolio_id: 1, date: '2024-02-15T10:00:00',
      type: TransactionType.DEPOSIT, ticker: null, quantity: null,
      price_per_share: null, fee: 0, total_amount: 1000, eur_amount: null, split_ratio: null,
    };
    vi.mocked(useTransactions).mockReturnValue({
      data: { transactions: [transaction], total: 1, page: 1, page_size: 20, total_pages: 1 },
      isLoading: false, isFetching: false, error: null,
    } as unknown as ReturnType<typeof useTransactions>);

    renderView(1);

    const fromInput = document.getElementById('tx-date-from') as HTMLInputElement;
    const toInput = document.getElementById('tx-date-to') as HTMLInputElement;

    // From > To — should mark To invalid and not pass dates to the query.
    await userEvent.type(fromInput, '2024-03-01');
    await userEvent.type(toInput, '2024-02-01');

    await waitFor(() => {
      expect(toInput).toHaveAttribute('aria-invalid', 'true');
      // Inline error message visible.
      expect(screen.getByRole('alert')).toHaveTextContent(/end date must be on or after start date/i);
    }, { timeout: 1000 });

    // The query was called but with undefined dates (the invalid range gets nulled).
    await waitFor(() => {
      expect(useTransactions).toHaveBeenLastCalledWith(
        1, 1, 20, undefined, undefined, 'desc', undefined, undefined
      );
    });
  });
});

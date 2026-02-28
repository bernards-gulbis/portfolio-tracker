import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '../components/TransactionTable';
import { Transaction, TransactionType } from '../api';
import { toast } from 'sonner';
import { useDeleteTransaction } from '../hooks/useTransactions';

vi.mock('../hooks/useTransactions', () => ({
  useDeleteTransaction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockTransactions: Transaction[] = [
  {
    id: 1,
    portfolio_id: 1,
    date: '2020-12-02T20:14:40',
    type: TransactionType.DEPOSIT,
    ticker: null,
    quantity: null,
    price_per_share: null,
    fee: 0,
    total_amount: 3000.0,
    eur_amount: 2760.27,
    split_ratio: null,
  },
  {
    id: 2,
    portfolio_id: 1,
    date: '2020-12-02T20:16:10',
    type: TransactionType.BUY,
    ticker: 'MSFT',
    quantity: 15.00000001,
    price_per_share: 183.69,
    fee: 0,
    total_amount: -2755.35,
    eur_amount: null,
    split_ratio: null,
  },
  {
    id: 3,
    portfolio_id: 1,
    date: '2021-01-15T10:00:00',
    type: TransactionType.DIVIDEND,
    ticker: 'MSFT',
    quantity: null,
    price_per_share: null,
    fee: 0,
    total_amount: 50.0,
    eur_amount: 46.0,
    split_ratio: null,
  },
];

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe('TransactionTable', () => {
  const mockOnEdit = vi.fn();
  const mockOnPageChange = vi.fn();
  const mockOnTickerSearchChange = vi.fn();
  const mockOnTypeFilterChange = vi.fn();
  const defaultProps = {
    currentPage: 1,
    totalPages: 1,
    total: mockTransactions.length,
    responsePage: 1,
    responsePageSize: 20,
    gainByTxId: new Map<number, { gain: number; gainPct: number | null }>(),
    onPageChange: mockOnPageChange,
    isLoading: false,
    tickerSearch: '',
    onTickerSearchChange: mockOnTickerSearchChange,
    typeFilter: [],
    onTypeFilterChange: mockOnTypeFilterChange,
    sortOrder: 'desc' as const,
    onSortOrderChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDeleteTransaction).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteTransaction>);
  });

  it('renders the correct number of transaction rows', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    const rows = screen.getAllByTestId('transaction-row');
    expect(rows).toHaveLength(3);
  });

  it('displays transaction details correctly', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();

    expect(screen.getByText('Buy')).toBeInTheDocument();
    const msftElements = screen.getAllByText('MSFT');
    expect(msftElements).toHaveLength(2);
    expect(screen.getByText('-$2,755.35')).toBeInTheDocument();

    expect(screen.getByText('Dividend')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('shows empty state without filter bar when no transactions', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={[]}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          total={0}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('No Transactions Yet')).toBeInTheDocument();
    expect(screen.getByText('Upload a CSV file or add transactions manually using the button above.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search asset...')).not.toBeInTheDocument();
  });

  it('shows filter bar when no results but filters are active', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={[]}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          total={0}
          tickerSearch="AAPL"
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('No Matching Transactions')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search asset...')).toBeInTheDocument();
  });

  it('renders edit and delete buttons for each transaction', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    const menuButtons = screen.getAllByLabelText(/Actions for/);
    expect(menuButtons).toHaveLength(3);
  });

  it('formats currency values correctly', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$2,755.35')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('displays combined quantity and price per share', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('15.00000001 shares at $183.69')).toBeInTheDocument();
  });

  it('shows locked-in gain for SELL transactions', () => {
    const sellTransaction: Transaction = {
      id: 10,
      portfolio_id: 1,
      date: '2022-06-01T10:00:00',
      type: TransactionType.SELL,
      ticker: 'MSFT',
      quantity: 5,
      price_per_share: 270,
      fee: 0,
      total_amount: 1350,
      eur_amount: null,
      split_ratio: null,
    };

    const gainByTxId = new Map([[10, { gain: 432.75, gainPct: 47.25 }]]);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={[sellTransaction]}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          gainByTxId={gainByTxId}
          total={1}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/\+\$432\.75/)).toBeInTheDocument();
    expect(screen.getByText(/▲47\.25%/)).toBeInTheDocument();
  });

  it('shows negative gain for losing SELL transactions', () => {
    const sellTransaction: Transaction = {
      id: 11,
      portfolio_id: 1,
      date: '2022-06-01T10:00:00',
      type: TransactionType.SELL,
      ticker: 'AAPL',
      quantity: 3,
      price_per_share: 140,
      fee: 0,
      total_amount: 420,
      eur_amount: null,
      split_ratio: null,
    };

    const gainByTxId = new Map([[11, { gain: -80, gainPct: -16.0 }]]);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={[sellTransaction]}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          gainByTxId={gainByTxId}
          total={1}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/-\$80\.00/)).toBeInTheDocument();
    expect(screen.getByText(/▼16\.00%/)).toBeInTheDocument();
  });

  it('shows error toast when transaction delete fails', async () => {
    vi.mocked(useDeleteTransaction).mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValueOnce(new Error('Delete failed')),
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteTransaction>);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
        />
      </QueryClientProvider>
    );

    // Open the action menu for the first transaction row
    await userEvent.click(screen.getAllByLabelText(/Actions for/)[0]);

    // Click "Delete" in the dropdown
    await userEvent.click(await screen.findByText('Delete'));

    // Confirm deletion in the AlertDialog
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete transaction: Delete failed');
    });
  });
});

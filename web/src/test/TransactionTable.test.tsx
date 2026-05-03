import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransactionTable } from '../components/TransactionTable';
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
    onPageChange: mockOnPageChange,
    isLoading: false,
    tickerSearch: '',
    onTickerSearchChange: mockOnTickerSearchChange,
    typeFilter: [],
    onTypeFilterChange: mockOnTypeFilterChange,
    sortOrder: 'desc' as const,
    onSortOrderChange: vi.fn(),
    dateFrom: '',
    onDateFromChange: vi.fn(),
    dateTo: '',
    onDateToChange: vi.fn(),
    dateRangeInverted: false,
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

  it('renders pagination when totalPages > 1', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          totalPages={3}
          total={50}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('does not render pagination when totalPages is 1', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          totalPages={1}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('displays split ratio for split transactions', () => {
    const splitTx: Transaction[] = [
      {
        id: 10,
        portfolio_id: 1,
        date: '2021-06-01T10:00:00',
        type: TransactionType.SPLIT,
        ticker: 'AAPL',
        quantity: null,
        price_per_share: null,
        fee: null,
        total_amount: 0,
        eur_amount: null,
        split_ratio: 4,
      },
    ];
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={splitTx}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          total={1}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Split')).toBeInTheDocument();
    expect(screen.getByText('Split 1:4')).toBeInTheDocument();
  });

  it('toggles sort order when date header is clicked', async () => {
    const onSortOrderChange = vi.fn();
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          onSortOrderChange={onSortOrderChange}
        />
      </QueryClientProvider>
    );

    const dateButton = screen.getByRole('button', { name: /Date/ });
    await userEvent.click(dateButton);

    expect(onSortOrderChange).toHaveBeenCalledWith('asc');
  });

  it('calls onEdit when edit action is clicked', async () => {
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

    // Open the action menu for the first row
    await userEvent.click(screen.getAllByLabelText(/Actions for/)[0]);

    // Click "Edit"
    await userEvent.click(await screen.findByText('Edit'));

    expect(mockOnEdit).toHaveBeenCalledWith(mockTransactions[0]);
  });

  it('shows "showing X to Y of Z" text', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          total={50}
          responsePage={2}
          responsePageSize={20}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Showing 21-23 of 50')).toBeInTheDocument();
  });

  it('shows error toast when transaction delete fails', { timeout: 15000 }, async () => {
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

  it('navigates to next page when Next is clicked', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={2}
          totalPages={5}
          total={100}
        />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByText('Next'));
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('navigates to previous page when Previous is clicked', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={3}
          totalPages={5}
          total={100}
        />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByText('Previous'));
    expect(mockOnPageChange).toHaveBeenCalledWith(2);
  });

  it('navigates to specific page when page link is clicked', async () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={1}
          totalPages={5}
          total={100}
        />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByText('3'));
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
  });

  it('shows all page numbers without ellipsis when totalPages <= 7', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={1}
          totalPages={5}
          total={100}
        />
      </QueryClientProvider>
    );

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
    expect(screen.queryByText('More pages')).not.toBeInTheDocument();
  });

  it('shows start ellipsis when currentPage > 3', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={5}
          totalPages={10}
          total={200}
        />
      </QueryClientProvider>
    );

    // Should have at least one ellipsis element (More pages is the accessible name for PaginationEllipsis)
    const ellipses = screen.getAllByText('More pages');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('shows both ellipses when in middle of many pages', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={5}
          totalPages={10}
          total={200}
        />
      </QueryClientProvider>
    );

    const ellipses = screen.getAllByText('More pages');
    expect(ellipses).toHaveLength(2);
  });

  it('shows end ellipsis but not start when currentPage <= 3', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={2}
          totalPages={10}
          total={200}
        />
      </QueryClientProvider>
    );

    const ellipses = screen.getAllByText('More pages');
    expect(ellipses).toHaveLength(1);
  });

  it('calls onTickerSearchChange when typing in search input', async () => {
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

    const searchInput = screen.getByPlaceholderText('Search asset...');
    await userEvent.type(searchInput, 'MSFT');
    expect(mockOnTickerSearchChange).toHaveBeenCalled();
  });

  it('toggles sort from asc to desc when date header is clicked', async () => {
    const onSortOrderChange = vi.fn();
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          sortOrder="asc"
          onSortOrderChange={onSortOrderChange}
        />
      </QueryClientProvider>
    );

    const dateButton = screen.getByRole('button', { name: /Date/ });
    await userEvent.click(dateButton);
    expect(onSortOrderChange).toHaveBeenCalledWith('desc');
  });

  it('calls onTypeFilterChange when a type checkbox is toggled', async () => {
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

    // Open the filter dropdown
    const filterButton = screen.getByRole('button', { name: /All Types/i });
    await userEvent.click(filterButton);

    // Click a checkbox item
    const depositItem = await screen.findByRole('menuitemcheckbox', { name: /Deposit/i });
    await userEvent.click(depositItem);

    expect(mockOnTypeFilterChange).toHaveBeenCalledWith(['Deposit']);
  });

  it('shows filter count label when filters are active', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={mockTransactions}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          typeFilter={['Deposit', 'Buy']}
        />
      </QueryClientProvider>
    );

    // With 2 active filters, should show count label like "2 types"
    expect(screen.getByText(/2 types/i)).toBeInTheDocument();
  });

  it('navigates to previous page when last transaction on page is deleted', async () => {
    const mockDeleteMutateAsync = vi.fn().mockResolvedValueOnce({});
    vi.mocked(useDeleteTransaction).mockReturnValue({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteTransaction>);

    const singleTransaction: Transaction[] = [mockTransactions[0]];
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          transactions={singleTransaction}
          portfolioId={1}
          onEdit={mockOnEdit}
          {...defaultProps}
          currentPage={3}
          totalPages={3}
          total={41}
        />
      </QueryClientProvider>
    );

    // Open actions menu
    await userEvent.click(screen.getByLabelText(/Actions for/));
    // Click delete
    await userEvent.click(await screen.findByText('Delete'));
    // Confirm in dialog
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });
  });
});

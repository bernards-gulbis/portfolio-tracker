import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '../components/TransactionTable';
import { Transaction, TransactionType } from '../api';

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
    total_amount: 3000.0,  // Stored as positive
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
    total_amount: -2755.35,  // Stored as negative (money leaving account)
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
    total_amount: 50.0,  // Stored as positive
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
  const defaultProps = {
    currentPage: 1,
    totalPages: 1,
    total: mockTransactions.length,
    onPageChange: mockOnPageChange,
    isLoading: false,
  };

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

    // Check for deposit transaction
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();

    // Check for buy transaction
    expect(screen.getByText('Buy')).toBeInTheDocument();
    const msftElements = screen.getAllByText('MSFT');
    expect(msftElements).toHaveLength(2); // Appears in Buy and Dividend transactions
    expect(screen.getByText('-$2,755.35')).toBeInTheDocument();

    // Check for dividend transaction
    expect(screen.getByText('Dividend')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('shows empty state when no transactions', () => {
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

    // Check that action menu buttons exist (one for each transaction)
    // Note: aria-labels now include context like "Actions for MSFT on Dec 2, 2020, 08:16 PM"
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

    // Check USD formatting in Total Amount column
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$2,755.35')).toBeInTheDocument();
    expect(screen.getByText('$183.69')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('displays units with 8 decimal places', () => {
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

    expect(screen.getByText('15.00000001')).toBeInTheDocument();
  });
});

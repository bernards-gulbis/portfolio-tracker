import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '../components/TransactionTable';
import { Transaction, TransactionType } from '../api';

const mockTransactions: Transaction[] = [
  {
    id: 1,
    portfolio_id: 1,
    date_time: '2020-12-02T20:14:40',
    type: TransactionType.DEPOSIT,
    ticker: null,
    units: null,
    price: null,
    fee: 0,
    value: 3000.0,
    value_eur: 2760.27,
    split_ratio: null,
  },
  {
    id: 2,
    portfolio_id: 1,
    date_time: '2020-12-02T20:16:10',
    type: TransactionType.BUY,
    ticker: 'MSFT',
    units: 15.00000001,
    price: 183.69,
    fee: 0,
    value: -2755.35,
    value_eur: null,
    split_ratio: null,
  },
  {
    id: 3,
    portfolio_id: 1,
    date_time: '2021-01-15T10:00:00',
    type: TransactionType.DIVIDEND,
    ticker: 'MSFT',
    units: null,
    price: null,
    fee: 0,
    value: 50.0,
    value_eur: 46.0,
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

  it('renders the correct number of transaction rows', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable transactions={mockTransactions} portfolioId={1} onEdit={mockOnEdit} />
      </QueryClientProvider>
    );

    const rows = screen.getAllByTestId('transaction-row');
    expect(rows).toHaveLength(3);
  });

  it('displays transaction details correctly', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable transactions={mockTransactions} portfolioId={1} onEdit={mockOnEdit} />
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
        <TransactionTable transactions={[]} portfolioId={1} onEdit={mockOnEdit} />
      </QueryClientProvider>
    );

    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
    expect(screen.getByText('Upload a CSV file or add transactions manually.')).toBeInTheDocument();
  });

  it('renders edit and delete buttons for each transaction', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable transactions={mockTransactions} portfolioId={1} onEdit={mockOnEdit} />
      </QueryClientProvider>
    );

    const editButtons = screen.getAllByText('Edit');
    const deleteButtons = screen.getAllByText('Delete');

    expect(editButtons).toHaveLength(3);
    expect(deleteButtons).toHaveLength(3);
  });

  it('formats currency values correctly', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable transactions={mockTransactions} portfolioId={1} onEdit={mockOnEdit} />
      </QueryClientProvider>
    );

    // Check USD formatting
    expect(screen.getByText('$3,000.00')).toBeInTheDocument();
    expect(screen.getByText('-$2,755.35')).toBeInTheDocument();
    expect(screen.getByText('$183.69')).toBeInTheDocument();

    // Check EUR formatting
    expect(screen.getByText('€2,760.27')).toBeInTheDocument();
    expect(screen.getByText('€46.00')).toBeInTheDocument();
  });

  it('displays units with 8 decimal places', () => {
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable transactions={mockTransactions} portfolioId={1} onEdit={mockOnEdit} />
      </QueryClientProvider>
    );

    expect(screen.getByText('15.00000001')).toBeInTheDocument();
  });
});

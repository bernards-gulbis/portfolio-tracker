import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useTransactions,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useImportTransactionsCSV,
} from '../hooks/useTransactions';
import * as api from '../api';
import type { PaginatedTransactionResponse, Transaction, TransactionType } from '../api';
import { toast } from 'sonner';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getTransactions: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    importTransactionsCSV: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const mockTransaction: Transaction = {
  id: 1,
  portfolio_id: 1,
  date: '2024-01-01T00:00:00',
  type: 'Deposit' as TransactionType,
  ticker: null,
  quantity: null,
  price_per_share: null,
  fee: 0,
  total_amount: 1000,
  eur_amount: 920,
  split_ratio: null,
};

const mockPaginatedResponse: PaginatedTransactionResponse = {
  transactions: [mockTransaction],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

describe('useTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when portfolioId is null', () => {
    const { result } = renderHook(() => useTransactions(null), { wrapper: createWrapper() });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(api.getTransactions).not.toHaveBeenCalled();
  });

  it('fetches paginated data with page and pageSize params', async () => {
    vi.mocked(api.getTransactions).mockResolvedValueOnce(mockPaginatedResponse);

    const { result } = renderHook(() => useTransactions(1, 2, 10), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getTransactions).toHaveBeenCalledWith(1, 2, 10);
    expect(result.current.data).toEqual(mockPaginatedResponse);
  });

  it('fetches with default page and pageSize', async () => {
    vi.mocked(api.getTransactions).mockResolvedValueOnce(mockPaginatedResponse);

    const { result } = renderHook(() => useTransactions(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getTransactions).toHaveBeenCalledWith(1, 1, expect.any(Number));
  });
});

describe('useCreateTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createTransaction API and invalidates queries on success', async () => {
    vi.mocked(api.createTransaction).mockResolvedValueOnce(mockTransaction);
    vi.mocked(api.getTransactions).mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useCreateTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      portfolioId: 1,
      data: {
        date: '2024-01-01',
        type: 'Deposit' as TransactionType,
        total_amount: 1000,
      },
    });

    expect(api.createTransaction).toHaveBeenCalledWith(1, {
      date: '2024-01-01',
      type: 'Deposit',
      total_amount: 1000,
    });
  });

  it('shows "Transaction added" toast on success', async () => {
    vi.mocked(api.createTransaction).mockResolvedValueOnce(mockTransaction);
    vi.mocked(api.getTransactions).mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useCreateTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      portfolioId: 1,
      data: { date: '2024-01-01', type: 'Deposit' as TransactionType, total_amount: 1000 },
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Transaction added');
    });
  });
});

describe('useUpdateTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateTransaction API with correct arguments', async () => {
    vi.mocked(api.updateTransaction).mockResolvedValueOnce(mockTransaction);

    const { result } = renderHook(() => useUpdateTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      transactionId: 1,
      data: { total_amount: 2000 },
      portfolioId: 1,
    });

    expect(api.updateTransaction).toHaveBeenCalledWith(1, { total_amount: 2000 });
  });

  it('shows "Transaction updated" toast on success', async () => {
    vi.mocked(api.updateTransaction).mockResolvedValueOnce(mockTransaction);

    const { result } = renderHook(() => useUpdateTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      transactionId: 1,
      data: { total_amount: 2000 },
      portfolioId: 1,
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Transaction updated');
    });
  });
});

describe('useDeleteTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteTransaction API and invalidates queries on success', async () => {
    vi.mocked(api.deleteTransaction).mockResolvedValueOnce(undefined);
    vi.mocked(api.getTransactions).mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ transactionId: 1, portfolioId: 1 });

    expect(api.deleteTransaction).toHaveBeenCalledWith(1);
  });

  it('shows "Transaction deleted" toast on success', async () => {
    vi.mocked(api.deleteTransaction).mockResolvedValueOnce(undefined);
    vi.mocked(api.getTransactions).mockResolvedValue(mockPaginatedResponse);

    const { result } = renderHook(() => useDeleteTransaction(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ transactionId: 1, portfolioId: 1 });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Transaction deleted');
    });
  });
});

describe('useImportTransactionsCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls importTransactionsCSV API with portfolioId and file', async () => {
    vi.mocked(api.importTransactionsCSV).mockResolvedValueOnce({ imported_count: 3, transactions: [] });

    const { result } = renderHook(() => useImportTransactionsCSV(), { wrapper: createWrapper() });
    const file = new File(['date,type\n2024-01-01,Deposit'], 'data.csv', { type: 'text/csv' });

    await result.current.mutateAsync({ portfolioId: 1, file });

    expect(api.importTransactionsCSV).toHaveBeenCalledWith(1, file);
  });

  it('shows plural "transactions" toast when count > 1', async () => {
    vi.mocked(api.importTransactionsCSV).mockResolvedValueOnce({ imported_count: 3, transactions: [] });

    const { result } = renderHook(() => useImportTransactionsCSV(), { wrapper: createWrapper() });
    const file = new File([''], 'data.csv', { type: 'text/csv' });

    await result.current.mutateAsync({ portfolioId: 1, file });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Imported 3 transactions');
    });
  });

  it('shows singular "transaction" toast when count is 1', async () => {
    vi.mocked(api.importTransactionsCSV).mockResolvedValueOnce({ imported_count: 1, transactions: [] });

    const { result } = renderHook(() => useImportTransactionsCSV(), { wrapper: createWrapper() });
    const file = new File([''], 'data.csv', { type: 'text/csv' });

    await result.current.mutateAsync({ portfolioId: 1, file });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Imported 1 transaction');
    });
  });
});

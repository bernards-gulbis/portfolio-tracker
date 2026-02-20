import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useTransactions,
  useCreateTransaction,
  useDeleteTransaction,
} from '../hooks/useTransactions';
import * as api from '../api';
import type { PaginatedTransactionResponse, Transaction, TransactionType } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getTransactions: vi.fn(),
    createTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  };
});

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
});

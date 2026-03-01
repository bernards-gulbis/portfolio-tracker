import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAggregatedStatus } from '../hooks/useAggregatedStatus';
import * as api from '../api';
import type { PortfolioStatus } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getAggregatedStatus: vi.fn(),
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

const mockStatus: PortfolioStatus = {
  portfolio_id: 0,
  portfolio_name: 'Aggregated',
  current_value: 15000,
  principal: 12000,
  principal_eur: 11040,
  dividends: 300,
  dividends_eur: 276,
  cash: 1000,
  holdings: [],
  holdings_cost: 11000,
  holdings_value: 14000,
  unrealized_gains: 3000,
  unrealized_gains_pct: 27.27,
  realized_gains: 0,
  capital_gains_tax_rate: 0.255,
  missing_prices: [],
  usd_to_eur_rate: 0.92,
};

describe('useAggregatedStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when portfolioIds is empty', () => {
    const { result } = renderHook(() => useAggregatedStatus([]), { wrapper: createWrapper() });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(api.getAggregatedStatus).not.toHaveBeenCalled();
  });

  it('fetches and returns status when portfolioIds are provided', async () => {
    vi.mocked(api.getAggregatedStatus).mockResolvedValueOnce(mockStatus);

    const { result } = renderHook(() => useAggregatedStatus([1, 2]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getAggregatedStatus).toHaveBeenCalledWith([1, 2]);
    expect(result.current.data).toEqual(mockStatus);
  });

  it('sorts portfolio IDs for consistent query key', async () => {
    vi.mocked(api.getAggregatedStatus).mockResolvedValueOnce(mockStatus);

    const { result } = renderHook(() => useAggregatedStatus([3, 1, 2]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should call with sorted IDs
    expect(api.getAggregatedStatus).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('handles API errors', async () => {
    vi.mocked(api.getAggregatedStatus).mockRejectedValueOnce(new Error('Server error'));

    const { result } = renderHook(() => useAggregatedStatus([1]), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });
});

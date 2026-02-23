import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import * as api from '../api';
import type { PortfolioStatus } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    getPortfolioStatus: vi.fn(),
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
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  current_value: 10000,
  current_value_eur: 9200,
  principal: 8000,
  principal_eur: 7360,
  dividends: 200,
  dividends_eur: 184,
  cash: 500,
  holdings: [],
  holdings_cost: 7500,
  holdings_value: 9500,
  unrealized_gains: 2000,
  unrealized_gains_pct: 25,
  unrealized_gains_eur: 1840,
  realized_gains: 0,
  currency_gains_eur: 0,
  currency_gains_pct: 0,
  capital_gains_eur: 1840,
  capital_gains_tax_rate: 0.255,
  tax_eur: 460,
  total_return_after_tax_eur: 1380,
  total_return_after_tax_pct: 18.75,
  current_value_after_tax_eur: 8740,
  missing_prices: [],
};

describe('usePortfolioStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when portfolioId is null', () => {
    const { result } = renderHook(() => usePortfolioStatus(null), { wrapper: createWrapper() });

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(api.getPortfolioStatus).not.toHaveBeenCalled();
  });

  it('fetches and returns status when portfolioId is provided', async () => {
    vi.mocked(api.getPortfolioStatus).mockResolvedValueOnce(mockStatus);

    const { result } = renderHook(() => usePortfolioStatus(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.getPortfolioStatus).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(mockStatus);
  });

  it('is not loading when portfolioId is null', () => {
    const { result } = renderHook(() => usePortfolioStatus(null), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(false);
  });

  it('handles API errors', async () => {
    vi.mocked(api.getPortfolioStatus).mockRejectedValueOnce(new Error('Not found'));

    const { result } = renderHook(() => usePortfolioStatus(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
  });
});

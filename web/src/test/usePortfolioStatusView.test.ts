import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { usePortfolioStatusView } from '../hooks/usePortfolioStatusView';
import type { PortfolioStatus, PortfolioPerformance } from '../api';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../hooks/usePortfolioStatus', () => ({ usePortfolioStatus: vi.fn() }));
vi.mock('../hooks/useLivePrices', () => ({ useLivePrices: vi.fn() }));
vi.mock('../hooks/usePortfolioPerformance', () => ({ usePortfolioPerformance: vi.fn() }));

import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { useLivePrices } from '../hooks/useLivePrices';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  principal: 8000,
  principal_eur: 7360,
  principal_eur_avg: 7360,
  dividends: 200,
  dividends_eur: 184,
  cash: 500,
  holdings: [
    { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1500, first_buy_date: '2024-01-01' },
  ],
  holdings_cost: 7500,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0.255,
  warnings: [],
  usd_to_eur_rate: 0.92,
  eur_incomplete: false,
  fx_missing_tx_ids: [],
  transaction_count: 5,
};

const emptyStatus: PortfolioStatus = {
  ...mockStatus,
  principal: 0,
  dividends: 0,
  cash: 0,
  realized_gains: 0,
  holdings: [],
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
};

const mockPerformance: PortfolioPerformance = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  cost_basis_fallback_tickers: [],
  warnings: [],
  data_points: [],
};

const mockLivePrices = {
  prices: { AAPL: 200 },
  usd_to_eur_rate: 0.92,
  timestamp: '2026-01-01T00:00:00Z',
  provider_unavailable: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function setupDefaultMocks() {
  vi.mocked(usePortfolioStatus).mockReturnValue({
    data: mockStatus,
    isLoading: false,
    error: null,
    dataUpdatedAt: Date.now(),
  } as unknown as ReturnType<typeof usePortfolioStatus>);

  vi.mocked(useLivePrices).mockReturnValue({
    data: mockLivePrices,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    error: null,
  } as unknown as ReturnType<typeof useLivePrices>);

  vi.mocked(usePortfolioPerformance).mockReturnValue({
    data: mockPerformance,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof usePortfolioPerformance>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('usePortfolioStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('returns undefined effectiveStatus when status is not loaded', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.effectiveStatus).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns computed effectiveStatus when status and live prices are loaded', () => {
    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.effectiveStatus).toBeDefined();
    expect(result.current.effectiveStatus?.portfolio_id).toBe(1);
  });

  it('isEmptyPortfolio is false for a non-empty status', () => {
    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isEmptyPortfolio).toBe(false);
  });

  it('isEmptyPortfolio is true when status has no holdings, cash, dividends or realized data', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: emptyStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: { ...mockLivePrices, prices: {} },
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isEmptyPortfolio).toBe(true);
  });

  it('exposes performance data and performanceError', () => {
    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.performance).toBe(mockPerformance);
    expect(result.current.performanceError).toBeNull();
  });

  it('exposes livePricesError when the live-price fetch fails', () => {
    const livePriceErr = new Error('price fetch failed');
    vi.mocked(useLivePrices).mockReturnValue({
      data: undefined,
      isFetching: false,
      dataUpdatedAt: 0,
      error: livePriceErr,
    } as unknown as ReturnType<typeof useLivePrices>);

    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.livePricesError).toBe(livePriceErr);
  });

  it('isRefreshing starts as false', () => {
    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isRefreshing).toBe(false);
  });

  it('handleRefresh calls invalidateQueries for status, performance, and livePrices', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => usePortfolioStatusView(1), { wrapper });

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['portfolioStatus', 1] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['portfolioPerformance', 1] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['livePrices'] }),
    );
  });

  it('latestUpdateAt is the max of status and livePrice updatedAt timestamps', () => {
    const statusTime = 1000;
    const pricesTime = 2000;

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: statusTime,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: mockLivePrices,
      isFetching: false,
      dataUpdatedAt: pricesTime,
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    const { result } = renderHook(() => usePortfolioStatusView(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.latestUpdateAt).toBe(pricesTime);
  });

  it('works correctly when portfolioId is null', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: undefined,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    vi.mocked(usePortfolioPerformance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioPerformance>);

    const { result } = renderHook(() => usePortfolioStatusView(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.effectiveStatus).toBeUndefined();
    expect(result.current.isEmptyPortfolio).toBe(false);
  });
});

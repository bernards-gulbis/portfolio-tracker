import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { LivePrices, PricedPortfolioStatus } from '../api';
import { computePricedStatus } from '../utils/computePricedStatus';

import { useLivePrices } from './useLivePrices';
import { usePortfolioPerformance } from './usePortfolioPerformance';
import { usePortfolioStatus } from './usePortfolioStatus';

const EMPTY_LIVE: LivePrices = {
  prices: {},
  usd_to_eur_rate: null,
  timestamp: '',
  provider_unavailable: false,
};

/**
 * Result bag for the status view: everything the view needs to render,
 * pre-composed from the three underlying react-query hooks.
 */
export interface PortfolioStatusViewResult {
  /** Transaction-derived status merged with live prices; undefined until status loads. */
  effectiveStatus: PricedPortfolioStatus | undefined;
  performance: ReturnType<typeof usePortfolioPerformance>['data'];
  isLoading: boolean;
  isPerformanceLoading: boolean;
  isLivePricesFetching: boolean;
  livePrices: LivePrices | undefined;
  livePricesError: Error | null;
  /** Surfaced so the chart card can show a real error instead of the
   *  "no data" empty state when the backend throws. */
  performanceError: Error | null;
  error: Error | null;
  /** Newest of (status, livePrices) fetched-at; 0 when neither has loaded. */
  latestUpdateAt: number;
  /** True iff user has no transactions at all (dividends, withdrawals, holdings, realized, cash). */
  isEmptyPortfolio: boolean;
  isRefreshing: boolean;
  /** Invalidate all three queries to force a refetch; sets isRefreshing while in flight. */
  handleRefresh: () => Promise<void>;
}

const isEmpty = (s: PricedPortfolioStatus): boolean =>
  s.holdings.length === 0 &&
  s.principal === 0 &&
  s.cash === 0 &&
  s.dividends === 0 &&
  s.realized_gains === 0 &&
  s.realized_sales.length === 0 &&
  s.dividends_received.length === 0 &&
  s.realized_withdrawals.length === 0;

/**
 * Compose `usePortfolioStatus`, `useLivePrices`, `usePortfolioPerformance`
 * into a single hook that the view can consume with one dependency.
 *
 * Extracting this out of the component gives us:
 *   - a single mock point in tests instead of four,
 *   - an obvious seam for alternate UIs (e.g. mini dashboards) to reuse,
 *   - a thin render layer in `PortfolioStatusView`.
 */
export function usePortfolioStatusView(
  portfolioId: number | null,
): PortfolioStatusViewResult {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: status, isLoading, error, dataUpdatedAt } = usePortfolioStatus(portfolioId);

  const tickers = useMemo(
    () =>
      Array.from(new Set(status?.holdings.map((h) => h.ticker) ?? [])).sort((a, b) =>
        a.localeCompare(b),
      ),
    [status?.holdings],
  );

  // Poll live prices even when the portfolio has no holdings: a cash-only
  // portfolio still needs fresh USD→EUR rate for display. Gating on
  // tickers.length would leave it stale until the status query revalidates.
  const {
    data: livePrices,
    isFetching: isLivePricesFetching,
    dataUpdatedAt: livePricesUpdatedAt,
    error: livePricesError,
  } = useLivePrices(tickers, !!status);

  const effectiveStatus = useMemo(
    () => (status == null ? undefined : computePricedStatus(status, livePrices ?? EMPTY_LIVE)),
    [status, livePrices],
  );

  // Fetch full history — period filtering happens client-side in PerformanceChart.
  const {
    data: performance,
    isLoading: isPerformanceLoading,
    error: performanceError,
  } = usePortfolioPerformance(portfolioId, undefined, undefined, 365);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolioStatus', portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ['portfolioPerformance', portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ['livePrices'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, portfolioId]);

  return {
    effectiveStatus,
    performance,
    isLoading,
    isPerformanceLoading,
    isLivePricesFetching,
    livePrices,
    livePricesError,
    performanceError,
    error,
    latestUpdateAt: Math.max(dataUpdatedAt, livePricesUpdatedAt || 0),
    isEmptyPortfolio: effectiveStatus != null && isEmpty(effectiveStatus),
    isRefreshing,
    handleRefresh,
  };
}

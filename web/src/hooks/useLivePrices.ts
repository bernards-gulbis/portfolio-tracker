import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getLivePrices, LivePrices } from '../api';

/**
 * Poll the backend for live prices + FX rate.
 *
 * An empty ``tickers`` array is intentionally allowed: cash-only portfolios
 * still need the USD→EUR rate to display amounts. Gating the query on
 * ``tickers.length > 0`` would leave those portfolios with whatever FX rate
 * came back in the initial status fetch. The backend returns ``prices: {}``
 * and a fresh ``usd_to_eur_rate`` when no tickers are requested.
 */
export const useLivePrices = (tickers: string[], enabled = true, intervalMs = 60_000) => {
  const normalizedTickers = useMemo(
    () => [...new Set(tickers)].sort((a, b) => a.localeCompare(b)),
    [tickers],
  );

  return useQuery<LivePrices>({
    queryKey: ['livePrices', normalizedTickers],
    queryFn: () => getLivePrices(normalizedTickers),
    enabled,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
};

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLivePrices, LivePrices } from '../api';

export const useLivePrices = (
  tickers: string[],
  enabled = true,
  intervalMs = 60_000,
) => {
  const normalizedTickers = useMemo(
    () => [...new Set(tickers)].sort((a, b) => a.localeCompare(b)),
    [tickers],
  );

  return useQuery<LivePrices>({
    queryKey: ['livePrices', normalizedTickers],
    queryFn: () => getLivePrices(normalizedTickers),
    enabled: enabled && normalizedTickers.length > 0,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
};

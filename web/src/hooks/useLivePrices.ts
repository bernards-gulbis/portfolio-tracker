import { useQuery } from '@tanstack/react-query';
import { getLivePrices, LivePrices } from '../api';

export const useLivePrices = (
  tickers: string[],
  enabled = true,
  intervalMs = 60_000,
) => {
  return useQuery<LivePrices>({
    queryKey: ['livePrices', [...tickers].sort()],
    queryFn: () => getLivePrices(tickers),
    enabled: enabled && tickers.length > 0,
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
};

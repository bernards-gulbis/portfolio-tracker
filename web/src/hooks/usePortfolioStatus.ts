import { useQuery } from '@tanstack/react-query';
import { getPortfolioStatus, PortfolioStatus } from '../api';

/**
 * Hook to fetch portfolio status including holdings, cash balance, and performance metrics.
 *
 * Inherits the QueryClient's default 5-minute ``staleTime`` so data is
 * considered fresh during typical interactions but revalidates on window focus
 * — important for two-tab edits where another tab may have mutated the
 * portfolio. ``gcTime`` stays Infinity to preserve cache during navigation.
 */
export const usePortfolioStatus = (portfolioId: number | null) => {
  return useQuery<PortfolioStatus>({
    queryKey: ['portfolioStatus', portfolioId],
    queryFn: () => {
      if (!portfolioId) {
        throw new Error('Portfolio ID is required');
      }
      return getPortfolioStatus(portfolioId);
    },
    enabled: !!portfolioId,
    gcTime: Infinity,
  });
};

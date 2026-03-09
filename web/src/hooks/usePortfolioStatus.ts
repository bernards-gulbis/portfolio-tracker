import { useQuery } from '@tanstack/react-query';
import { getPortfolioStatus, PortfolioStatus } from '../api';

/**
 * Hook to fetch portfolio status including holdings, cash balance, and performance metrics.
 * Cache is effectively infinite — only invalidated explicitly after mutations.
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
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
};

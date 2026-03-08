import { useQuery } from '@tanstack/react-query';
import { getPortfolioStatus, PortfolioStatus } from '../api';

/**
 * Hook to fetch portfolio status including holdings, cash balance, and performance metrics
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
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

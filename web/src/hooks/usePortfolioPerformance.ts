import { useQuery } from '@tanstack/react-query';
import { getPortfolioPerformance, PortfolioPerformance } from '../api';

/**
 * Hook to fetch portfolio performance data over time
 */
export const usePortfolioPerformance = (
  portfolioId: number | null,
  startDate?: string,
  endDate?: string,
  numPoints?: number
) => {
  return useQuery<PortfolioPerformance, Error>({
    queryKey: ['portfolioPerformance', portfolioId, startDate, endDate, numPoints],
    queryFn: () => {
      if (portfolioId === null) {
        throw new Error('Portfolio ID is required');
      }
      return getPortfolioPerformance(portfolioId, startDate, endDate, numPoints);
    },
    enabled: portfolioId !== null,
    staleTime: 30_000, // Consider data stale after 30 seconds (matches usePortfolioStatus)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
};

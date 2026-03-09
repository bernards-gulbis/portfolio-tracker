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
    staleTime: 0,
    gcTime: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

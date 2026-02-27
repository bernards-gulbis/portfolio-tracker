import { useQuery } from '@tanstack/react-query';
import { getAggregatedPerformance, PortfolioPerformance } from '../api';

export const useAggregatedPerformance = (
  portfolioIds: number[],
  startDate?: string,
  endDate?: string,
  numPoints?: number
) => {
  const sortedIds = [...portfolioIds].sort((a, b) => a - b);
  return useQuery<PortfolioPerformance, Error>({
    queryKey: ['aggregatedPerformance', ...sortedIds],
    queryFn: () => getAggregatedPerformance(sortedIds, startDate, endDate, numPoints),
    enabled: sortedIds.length > 0,
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
  });
};

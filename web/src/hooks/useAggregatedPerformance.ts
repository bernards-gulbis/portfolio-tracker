import { useQuery } from '@tanstack/react-query';
import { getAggregatedPerformance, PortfolioPerformance } from '../api';

export const useAggregatedPerformance = (
  startDate?: string,
  endDate?: string,
  numPoints?: number,
  enabled: boolean = true
) => {
  return useQuery<PortfolioPerformance, Error>({
    queryKey: ['aggregatedPerformance'],
    queryFn: () => getAggregatedPerformance(startDate, endDate, numPoints),
    enabled,
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
  });
};

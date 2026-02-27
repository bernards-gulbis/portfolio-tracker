import { useQuery } from '@tanstack/react-query';
import { getAggregatedStatus, PortfolioStatus } from '../api';

export const useAggregatedStatus = (portfolioIds: number[]) => {
  const sortedIds = [...portfolioIds].sort((a, b) => a - b);
  return useQuery<PortfolioStatus>({
    queryKey: ['aggregatedStatus', ...sortedIds],
    queryFn: () => getAggregatedStatus(sortedIds),
    enabled: sortedIds.length > 0,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
};

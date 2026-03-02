import { useQuery } from '@tanstack/react-query';
import { getAggregatedStatus, PortfolioStatus } from '../api';

export const useAggregatedStatus = (enabled: boolean = true) => {
  return useQuery<PortfolioStatus>({
    queryKey: ['aggregatedStatus'],
    queryFn: () => getAggregatedStatus(),
    enabled,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
};

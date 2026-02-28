import { useQuery } from '@tanstack/react-query';
import { getPortfolioAggregatedSells } from '../api';

export const useAggregatedSales = (portfolioId: number | null, ticker?: string) => {
  return useQuery({
    queryKey: ['aggregatedSales', portfolioId, ticker],
    queryFn: () => getPortfolioAggregatedSells(portfolioId!, ticker),
    enabled: portfolioId !== null,
  });
};

import { useQuery } from '@tanstack/react-query';
import { getPortfolioSells } from '../api';

export const useRealizedSales = (portfolioId: number | null) => {
  return useQuery({
    queryKey: ['realizedSales', portfolioId],
    queryFn: () => getPortfolioSells(portfolioId!),
    enabled: portfolioId !== null,
  });
};

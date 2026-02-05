import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPortfolios, createPortfolio, updatePortfolio, deletePortfolio, copyPortfolio, PortfolioCreate, PortfolioUpdate } from '../api';

/**
 * Hook to fetch all portfolios
 */
export const usePortfolios = () => {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  });
};

/**
 * Hook to create a new portfolio
 */
export const useCreatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PortfolioCreate) => createPortfolio(data),
    onSuccess: () => {
      // Invalidate and refetch portfolios list
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

/**
 * Hook to update a portfolio
 */
export const useUpdatePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: number; data: PortfolioUpdate }) =>
      updatePortfolio(portfolioId, data),
    onSuccess: () => {
      // Invalidate and refetch portfolios list
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

/**
 * Hook to delete a portfolio
 */
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onSuccess: () => {
      // Invalidate and refetch portfolios list
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

/**
 * Hook to copy a portfolio with all its transactions
 */
export const useCopyPortfolio = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, newName }: { portfolioId: number; newName: string }) =>
      copyPortfolio(portfolioId, newName),
    onSuccess: () => {
      // Invalidate and refetch portfolios list
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    },
  });
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: PortfolioCreate) => createPortfolio(data),
    onSuccess: (portfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success(t('portfolio.toasts.created', { name: portfolio.name }));
    },
  });
};

/**
 * Hook to update a portfolio
 */
export const useUpdatePortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: number; data: PortfolioUpdate }) =>
      updatePortfolio(portfolioId, data),
    onSuccess: (portfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success(t('portfolio.toasts.renamed', { name: portfolio.name }));
    },
  });
};

/**
 * Hook to delete a portfolio
 */
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success(t('portfolio.toasts.deleted'));
    },
  });
};

/**
 * Hook to copy a portfolio with all its transactions
 */
export const useCopyPortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ portfolioId, newName }: { portfolioId: number; newName: string }) =>
      copyPortfolio(portfolioId, newName),
    onSuccess: (portfolio) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      toast.success(t('portfolio.toasts.copied', { name: portfolio.name }));
    },
  });
};

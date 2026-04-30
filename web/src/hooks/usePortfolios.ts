import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  getPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  copyPortfolio,
  type Portfolio,
  type PortfolioCreate,
  type PortfolioUpdate,
} from '../api';

const PORTFOLIOS_KEY = ['portfolios'] as const;

/**
 * Hook to fetch all portfolios
 */
export const usePortfolios = () => {
  return useQuery({
    queryKey: PORTFOLIOS_KEY,
    queryFn: getPortfolios,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to create a new portfolio.
 *
 * Optimistic: appends a placeholder portfolio with a negative temporary id
 * to the cached list immediately, then either replaces it with the server
 * response (onSettled invalidate) or rolls back on error.
 */
export const useCreatePortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: PortfolioCreate) => createPortfolio(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: PORTFOLIOS_KEY });
      const previous = queryClient.getQueryData<Portfolio[]>(PORTFOLIOS_KEY);
      const optimistic: Portfolio = {
        // Negative id is impossible from the server (auto-increment > 0) so
        // there's no collision risk with real ids during the in-flight window.
        id: -Date.now(),
        name: data.name,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(PORTFOLIOS_KEY, context.previous);
      }
    },
    onSuccess: (portfolio) => {
      toast.success(t('portfolio.toasts.created', { name: portfolio.name }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
    },
  });
};

/**
 * Hook to update a portfolio.
 *
 * Optimistic: renames the portfolio in the cached list immediately so the
 * dropdown reflects the new name before the server confirms.
 */
export const useUpdatePortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: number; data: PortfolioUpdate }) =>
      updatePortfolio(portfolioId, data),
    onMutate: async ({ portfolioId, data }) => {
      await queryClient.cancelQueries({ queryKey: PORTFOLIOS_KEY });
      const previous = queryClient.getQueryData<Portfolio[]>(PORTFOLIOS_KEY);
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old?.map((p) => (p.id === portfolioId ? { ...p, name: data.name } : p)) ?? old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(PORTFOLIOS_KEY, context.previous);
      }
    },
    onSuccess: (portfolio, { portfolioId }) => {
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', portfolioId] });
      toast.success(t('portfolio.toasts.renamed', { name: portfolio.name }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
    },
  });
};

/**
 * Hook to delete a portfolio.
 *
 * Optimistic: removes from the cached list immediately. On rollback, the
 * portfolio reappears in the dropdown.
 */
export const useDeletePortfolio = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onMutate: async (portfolioId) => {
      await queryClient.cancelQueries({ queryKey: PORTFOLIOS_KEY });
      const previous = queryClient.getQueryData<Portfolio[]>(PORTFOLIOS_KEY);
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old?.filter((p) => p.id !== portfolioId) ?? old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(PORTFOLIOS_KEY, context.previous);
      }
    },
    onSuccess: (_data, portfolioId) => {
      queryClient.removeQueries({ queryKey: ['portfolioStatus', portfolioId] });
      queryClient.removeQueries({ queryKey: ['transactions', portfolioId] });
      queryClient.removeQueries({ queryKey: ['portfolioPerformance', portfolioId] });
      toast.success(t('portfolio.toasts.deleted'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
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
      copyPortfolio(portfolioId, { new_name: newName }),
    onSuccess: (portfolio) => {
      queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
      toast.success(t('portfolio.toasts.copied', { name: portfolio.name }));
    },
  });
};

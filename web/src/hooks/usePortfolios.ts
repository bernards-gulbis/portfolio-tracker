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
  type PortfolioBase,
} from '../api';

const PORTFOLIOS_KEY = ['portfolios'] as const;

type OptimisticContext = { previous: Portfolio[] | undefined };

function useOptimisticPortfoliosMutation() {
  const queryClient = useQueryClient();

  const snapshot = async (): Promise<OptimisticContext> => {
    await queryClient.cancelQueries({ queryKey: PORTFOLIOS_KEY });
    return { previous: queryClient.getQueryData<Portfolio[]>(PORTFOLIOS_KEY) };
  };

  const rollback = (context: OptimisticContext | undefined) => {
    if (context?.previous != null) {
      queryClient.setQueryData(PORTFOLIOS_KEY, context.previous);
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PORTFOLIOS_KEY });
  };

  return { queryClient, snapshot, rollback, invalidate };
}

export const usePortfolios = () => {
  return useQuery({
    queryKey: PORTFOLIOS_KEY,
    queryFn: getPortfolios,
  });
};

export const useCreatePortfolio = () => {
  const { queryClient, snapshot, rollback, invalidate } = useOptimisticPortfoliosMutation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: PortfolioBase) => createPortfolio(data),
    onMutate: async (data) => {
      const context = await snapshot();
      const optimistic: Portfolio = {
        // Negative id avoids collision with server-issued auto-increment ids
        // during the in-flight window.
        id: -Date.now(),
        name: data.name,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old ? [...old, optimistic] : [optimistic],
      );
      return context;
    },
    onError: (_err, _vars, context) => rollback(context),
    onSuccess: (portfolio) => {
      toast.success(t('portfolio.toasts.created', { name: portfolio.name }));
    },
    onSettled: invalidate,
  });
};

export const useUpdatePortfolio = () => {
  const { queryClient, snapshot, rollback, invalidate } = useOptimisticPortfoliosMutation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: number; data: PortfolioBase }) =>
      updatePortfolio(portfolioId, data),
    onMutate: async ({ portfolioId, data }) => {
      const context = await snapshot();
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old?.map((p) => (p.id === portfolioId ? { ...p, name: data.name } : p)) ?? old,
      );
      return context;
    },
    onError: (_err, _vars, context) => rollback(context),
    onSuccess: (portfolio, { portfolioId }) => {
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', portfolioId] });
      toast.success(t('portfolio.toasts.renamed', { name: portfolio.name }));
    },
    onSettled: invalidate,
  });
};

export const useDeletePortfolio = () => {
  const { queryClient, snapshot, rollback, invalidate } = useOptimisticPortfoliosMutation();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (portfolioId: number) => deletePortfolio(portfolioId),
    onMutate: async (portfolioId) => {
      const context = await snapshot();
      queryClient.setQueryData<Portfolio[]>(PORTFOLIOS_KEY, (old) =>
        old?.filter((p) => p.id !== portfolioId) ?? old,
      );
      return context;
    },
    onError: (_err, _vars, context) => rollback(context),
    onSuccess: (_data, portfolioId) => {
      queryClient.removeQueries({ queryKey: ['portfolioStatus', portfolioId] });
      queryClient.removeQueries({ queryKey: ['transactions', portfolioId] });
      queryClient.removeQueries({ queryKey: ['portfolioPerformance', portfolioId] });
      toast.success(t('portfolio.toasts.deleted'));
    },
    onSettled: invalidate,
  });
};

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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getPortfolio,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  importTransactionsCSV,
  TransactionCreate,
  TransactionUpdate,
} from '../api';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';

/**
 * Hook to fetch a portfolio with transactions
 */
export const usePortfolio = (portfolioId: number | null) => {
  return useQuery({
    queryKey: ['portfolio', portfolioId],
    queryFn: () => getPortfolio(portfolioId!),
    enabled: portfolioId !== null,
  });
};

/**
 * Hook to fetch transactions for a portfolio
 */
export const useTransactions = (
  portfolioId: number | null,
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
) => {
  return useQuery({
    queryKey: ['transactions', portfolioId, page, pageSize],
    queryFn: () => getTransactions(portfolioId!, page, pageSize),
    enabled: portfolioId !== null,
  });
};

/**
 * Hook to create a transaction
 */
export const useCreateTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, data }: { portfolioId: number; data: TransactionCreate }) =>
      createTransaction(portfolioId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', variables.portfolioId] });
      toast.success('Transaction added');
    },
  });
};

/**
 * Hook to update a transaction
 */
export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      data,
      portfolioId: _portfolioId,
    }: {
      transactionId: number;
      data: TransactionUpdate;
      portfolioId: number;
    }) => updateTransaction(transactionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['transactions', variables.portfolioId],
        exact: false
      });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', variables.portfolioId] });
      toast.success('Transaction updated');
    },
  });
};

/**
 * Hook to delete a transaction
 */
export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ transactionId, portfolioId: _portfolioId }: { transactionId: number; portfolioId: number }) =>
      deleteTransaction(transactionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['transactions', variables.portfolioId],
        exact: false
      });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', variables.portfolioId] });
      toast.success('Transaction deleted');
    },
  });
};

/**
 * Hook to import CSV transactions
 */
export const useImportTransactionsCSV = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ portfolioId, file }: { portfolioId: number; file: File }) =>
      importTransactionsCSV(portfolioId, file),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['transactions', variables.portfolioId],
        exact: false
      });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus', variables.portfolioId] });
      toast.success(`Imported ${result.imported_count} transaction${result.imported_count === 1 ? '' : 's'}`);
    },
  });
};

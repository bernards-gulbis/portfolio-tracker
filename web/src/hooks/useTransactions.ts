import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
export const useTransactions = (portfolioId: number | null) => {
  return useQuery({
    queryKey: ['transactions', portfolioId],
    queryFn: () => getTransactions(portfolioId!),
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
      portfolioId,
    }: {
      transactionId: number;
      data: TransactionUpdate;
      portfolioId: number;
    }) => updateTransaction(transactionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
    },
  });
};

/**
 * Hook to delete a transaction
 */
export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ transactionId, portfolioId }: { transactionId: number; portfolioId: number }) =>
      deleteTransaction(transactionId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', variables.portfolioId] });
    },
  });
};

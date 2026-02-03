import { Transaction, TransactionType } from '../api';

/**
 * Format currency value
 */
export const formatCurrency = (value: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Format date
 */
export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Get color class based on transaction type
 */
export const getTransactionColor = (transaction: Transaction): string => {
  const type = transaction.type;
  const value = transaction.value;

  // Positive value types (income)
  if (type === TransactionType.DEPOSIT || type === TransactionType.SELL || type === TransactionType.DIVIDEND) {
    return 'positive';
  }

  // Negative value types (expense)
  if (type === TransactionType.WITHDRAW || type === TransactionType.FEE || type === TransactionType.BUY) {
    return 'negative';
  }

  // Neutral types
  if (type === TransactionType.SPLIT) {
    return 'neutral';
  }

  // Fallback to value sign
  return value >= 0 ? 'positive' : 'negative';
};

/**
 * Format transaction type for display
 */
export const formatTransactionType = (type: TransactionType): string => {
  return type.toString();
};

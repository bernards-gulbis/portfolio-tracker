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
 * Format number with specified decimal places
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

/**
 * Get display value with appropriate sign based on transaction type
 * Values are stored as positive in DB, but displayed as negative for certain types
 */
export const getDisplayValue = (transaction: Transaction): number => {
  // Negative display types: FEE, WITHDRAW, BUY (spending money)
  if (transaction.type === TransactionType.FEE || 
      transaction.type === TransactionType.WITHDRAW || 
      transaction.type === TransactionType.BUY) {
    return -transaction.value;
  }

  // Positive display types: DEPOSIT, SELL, DIVIDEND, SPLIT (receiving money)
  return transaction.value;
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

  // Positive value types (income)
  if (type === TransactionType.DEPOSIT || type === TransactionType.SELL || type === TransactionType.DIVIDEND) {
    return 'positive';
  }

  // Negative value types (expense)
  if (type === TransactionType.WITHDRAW || type === TransactionType.FEE || type === TransactionType.BUY) {
    return 'negative';
  }

  // Neutral types (SPLIT)
  return 'neutral';
};

/**
 * Format transaction type for display
 */
export const formatTransactionType = (type: TransactionType): string => {
  return type.toString();
};

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
 * Values are now stored with their actual signs in the database
 */
export const getDisplayValue = (transaction: Transaction): number => {
  return transaction.total_amount;
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
 * Get color class based on value sign
 */
export const getValueColor = (value: number | null | undefined): string => {
  if (value == null) {
    return 'neutral';
  }
  if (value > 0) {
    return 'positive';
  } else if (value < 0) {
    return 'negative';
  }
  return 'neutral';
};

/**
 * Format transaction type for display
 */
export const formatTransactionType = (type: TransactionType): string => {
  return type.toString();
};

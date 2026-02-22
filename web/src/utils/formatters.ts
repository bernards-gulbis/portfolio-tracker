import { Transaction } from '../api';

/**
 * Format currency value. Pass the locale returned by useLocale() for reactive formatting.
 */
export const formatCurrency = (value: number, currency: string = 'USD', locale: string = 'en-US'): string => {
  return new Intl.NumberFormat(locale, {
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
 * Format date. Pass the locale returned by useLocale() for reactive formatting.
 */
export const formatDate = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
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

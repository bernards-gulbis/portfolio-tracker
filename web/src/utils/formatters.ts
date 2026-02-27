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
 * Format currency with a sign prefix: '+' for positive values, nothing for zero/negative
 * (negative sign is already included by formatCurrency). Returns '-' for null/undefined.
 */
export const formatSignedCurrency = (value: number | null | undefined, currency: string = 'USD', locale: string = 'en-US'): string => {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency, locale)}`;
};

/**
 * Format number with specified decimal places
 */
export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

/**
 * Format quantity — show up to 8 decimals but strip trailing zeros.
 */
export const formatQuantity = (value: number): string => {
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, '');
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
 * Compact date format for tables — drops year to save space.
 */
export const formatDateCompact = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

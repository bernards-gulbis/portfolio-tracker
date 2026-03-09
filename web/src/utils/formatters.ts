/** Cache for Intl.NumberFormat instances — avoids re-creating formatters on every call
 *  (e.g. during rapid mouse-hover updates on the performance chart). */
const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = (locale: string, currency: string): Intl.NumberFormat => {
  const key = `${locale}:${currency}`;
  let fmt = currencyFormatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatterCache.set(key, fmt);
  }
  return fmt;
};

/**
 * Format currency value. Pass the locale returned by useLocale() for reactive formatting.
 */
export const formatCurrency = (value: number, currency: string = 'USD', locale: string = 'en-US'): string => {
  return getCurrencyFormatter(locale, currency).format(value);
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
 * Format quantity — show up to 8 decimals but strip trailing zeros.
 */
export const formatQuantity = (value: number): string => {
  const fixed = value.toFixed(8);
  return fixed.replace(/\.?0+$/, '');
};

/**
 * Format date. Pass the locale returned by useLocale() for reactive formatting.
 */
export const formatDateTime = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Compact date format for tables — includes year, no time.
 */
export const formatDateCompact = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a percent value with ▲/▼ sign prefix. Returns '-' for null/undefined.
 */
export const formatSignedPercent = (value: number | null | undefined): string => {
  if (value == null) return '-';
  const sign = value >= 0 ? '\u25B2' : '\u25BC';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

/**
 * Returns a CSS class for positive/negative values (green/red).
 */
export const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'text-positive' : 'text-negative';
};

/**
 * Format a day count as a human-friendly duration string.
 * < 31 days  → "Xd"
 * 31–365     → "Xm Yd" (omit "0d")
 * > 365      → "Xy Xm" (omit "0m")
 */
const defaultDaysHeldLabels: { d: string; m: string; y: string } = { d: 'd', m: 'm', y: 'y' };

export const formatDaysHeld = (
  days: number,
  labels = defaultDaysHeldLabels,
): string => {
  if (days < 31) return `${days}${labels.d}`;
  if (days <= 365) {
    const months = Math.floor(days / 30);
    const remainDays = days - months * 30;
    return remainDays === 0 ? `${months}${labels.m}` : `${months}${labels.m} ${remainDays}${labels.d}`;
  }
  const years = Math.floor(days / 365);
  const remainMonths = Math.floor((days - years * 365) / 30);
  return remainMonths === 0 ? `${years}${labels.y}` : `${years}${labels.y} ${remainMonths}${labels.m}`;
};

/**
 * Format a Date as YYYY-MM-DD using local time (avoids UTC shift from toISOString).
 */
export const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

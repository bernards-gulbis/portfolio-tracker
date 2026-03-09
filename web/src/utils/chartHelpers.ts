import { toLocalDateStr } from './formatters';
import type { Currency } from '../hooks/useCurrencyPreference';

export type TimePeriod = '1month' | '3month' | '6month' | 'ytd' | '1year' | 'all';

/** Compact currency label for YAxis (e.g. €1.5M, €10k or $1.5M, $10k). */
export const formatCompactValue = (value: number, currency: Currency): string => {
  const symbol = currency === 'EUR' ? '€' : '$';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) {
    const kVal = Math.round(value / 1_000);
    if (Math.abs(kVal) >= 1_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
    return `${symbol}${kVal}k`;
  }
  return `${symbol}${value.toFixed(0)}`;
};

/** Subtract months from a date, clamping to the last day of the target month
 *  (e.g. March 31 minus 1 month → Feb 28, not March 3). */
export const subtractMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  // If the day overflowed (e.g. 31 → 3), clamp to last day of target month
  if (result.getDate() !== date.getDate()) {
    result.setDate(0);
  }
  return result;
};

/** Get the cutoff date string (YYYY-MM-DD) for a given period. */
export const getCutoffDate = (period: TimePeriod): string | null => {
  if (period === 'all') return null;
  const now = new Date();
  let cutoff: Date;
  switch (period) {
    case '1month':
      cutoff = subtractMonths(now, 1);
      break;
    case '3month':
      cutoff = subtractMonths(now, 3);
      break;
    case '6month':
      cutoff = subtractMonths(now, 6);
      break;
    case 'ytd':
      cutoff = new Date(now.getFullYear(), 0, 1);
      break;
    case '1year':
      cutoff = subtractMonths(now, 12);
      break;
  }
  return toLocalDateStr(cutoff);
};

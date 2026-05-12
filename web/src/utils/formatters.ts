export const MS_PER_DAY = 86_400_000;

/** Cached so rapid updates (e.g. chart hover) don't recreate Intl formatters. */
const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = (locale: string, currency: string): Intl.NumberFormat => {
  const key = `${locale}:${currency}`;
  const cached = currencyFormatterCache.get(key);
  if (cached) return cached;
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  currencyFormatterCache.set(key, fmt);
  return fmt;
};

/** Pass the locale returned by useLocale() for reactive formatting. */
export const formatCurrency = (value: number, currency: string = 'USD', locale: string = 'en-US'): string => {
  return getCurrencyFormatter(locale, currency).format(value);
};

/** Adds '+' for positive values; negatives keep their built-in sign. Returns '-' for null/undefined. */
export const formatSignedCurrency = (value: number | null | undefined, currency: string = 'USD', locale: string = 'en-US'): string => {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency, locale)}`;
};

/**
 * Strips trailing zeros (and an orphaned decimal point) from a fixed-decimal
 * string. Index walk rather than regex so the work is unconditionally linear
 * (SonarQube S5852: avoid super-linear backtracking).
 */
const trimTrailingZeros = (s: string): string => {
  let end = s.length;
  while (end > 0 && s[end - 1] === '0') end--;
  if (end > 0 && s[end - 1] === '.') end--;
  return s.slice(0, end);
};

/** Up to 6 decimals, trailing zeros stripped. */
export const formatQuantity = (value: number): string => {
  return trimTrailingZeros(value.toFixed(6));
};

/** Pass the locale returned by useLocale() for reactive formatting. */
export const formatDateTime = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Compact date (no time) for tables. */
export const formatDateCompact = (date: string, locale: string = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** Percent value with +/- sign; '-' for null/undefined.
 *  Pair with a leading arrow span when the caller renders a money/percent pair. */
export const formatSignedPercentPlain = (value: number | null | undefined): string => {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

/** Percentage-points difference, e.g. ``-5.4 pp``; '—' for null/undefined.
 *  Use for benchmark spreads (portfolio % − benchmark %) so the unit can't be confused
 *  with an absolute percent. */
export const formatSignedPp = (value: number | null | undefined, unit: string = 'pp'): string => {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)} ${unit}`;
};

export interface RelativeTimeLabels {
  justNow: string;
  /** "{count} min ago" */
  minutes: (count: number) => string;
  /** "{count} h ago" */
  hours: (count: number) => string;
  /** "{count} d ago" */
  days: (count: number) => string;
}

/** Human-readable elapsed time vs ``now``. Falls back to a full date string for ≥ 7 days. */
export const formatRelativeTime = (
  timestamp: number,
  now: number,
  labels: RelativeTimeLabels,
  locale: string = 'en-US',
): string => {
  const diffMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return labels.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return labels.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return labels.hours(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return labels.days(days);
  return new Date(timestamp).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** CSS class for positive (green) / negative (red) values. */
export const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'text-positive' : 'text-negative';
};

const defaultDaysHeldLabels: { d: string; m: string; y: string } = { d: 'd', m: 'm', y: 'y' };

/**
 * Day count → human duration:
 * <31 → "Xd"; 31–365 → "Xm Yd" (omit "0d"); >365 → "Xy Xm" (omit "0m").
 */
export const formatDaysHeld = (
  days: number,
  labels = defaultDaysHeldLabels,
): string => {
  if (days < 31) return `${days}${labels.d}`;
  if (days <= 365) {
    const months = Math.floor(days / 30);
    const remainDays = days - months * 30;
    if (remainDays === 0) return `${months}${labels.m}`;
    return `${months}${labels.m} ${remainDays}${labels.d}`;
  }
  const years = Math.floor(days / 365);
  const remainMonths = Math.floor((days - years * 365) / 30);
  if (remainMonths === 0) return `${years}${labels.y}`;
  return `${years}${labels.y} ${remainMonths}${labels.m}`;
};

/** YYYY-MM-DD using local time (avoids UTC shift from toISOString). */
export const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Tax-rate fraction (0..1) → percent string with up to 2 decimals; trailing zeros trimmed. */
export const formatTaxRatePercent = (rate: number): string => {
  return trimTrailingZeros((rate * 100).toFixed(2));
};

/**
 * Whole-day count from a YYYY-MM-DD-prefixed date string to a reference timestamp,
 * using local-calendar semantics. Avoids UTC-parse off-by-one in negative-UTC zones
 * and DST drift from raw millisecond arithmetic.
 */
export const daysSinceLocalDate = (dateStr: string, now: number): number => {
  const [yStr, mStr, dStr] = dateStr.slice(0, 10).split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return 0;
  const todayLocal = new Date(now);
  const thenUtc = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(
    todayLocal.getFullYear(),
    todayLocal.getMonth(),
    todayLocal.getDate(),
  );
  return Math.floor((todayUtc - thenUtc) / MS_PER_DAY);
};

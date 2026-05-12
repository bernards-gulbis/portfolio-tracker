import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatSignedPp } from '../../utils/formatters';
import type { Currency } from '../../hooks/useCurrencyPreference';
import type {
  ChartDataPoint,
  HeaderInfo,
  PctHeaderInfo,
  ValueHeaderInfo,
  ViewMode,
} from './types';

/** Parse YYYY-MM-DD as a local date — avoids UTC shift in negative-offset timezones. */
export const parseYMD = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatPctDisplay = (pct: number): string =>
  `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

const EMPTY_VALUE_HEADER: ValueHeaderInfo = {
  mode: 'value',
  displayValue: '-',
  changeDisplay: null,
  pctDisplay: '',
  spreadDisplay: null,
  isPositive: true,
};

/** Pre-formatted vs-S&P spread (portfolio − benchmark) in percentage points.
 *  Uses the rebased ``returnPct`` / ``sp500ReturnPct`` so it stays consistent with the chart line. */
const computeSpread = (point: ChartDataPoint, ppLabel: string): string | null => {
  if (point.returnPct == null || point.sp500ReturnPct == null) return null;
  return formatSignedPp(point.returnPct - point.sp500ReturnPct, ppLabel);
};

const getValueHeaderInfo = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
  ppLabel: string,
): ValueHeaderInfo => {
  const value = point.currentValue;
  const spreadDisplay = computeSpread(point, ppLabel);
  if (value == null) return { ...EMPTY_VALUE_HEADER, spreadDisplay };

  const formatted = formatCurrency(value, currency, locale);
  const base = isAllTime ? point.principal : first.currentValue;
  if (base == null) {
    return { ...EMPTY_VALUE_HEADER, displayValue: formatted, spreadDisplay };
  }

  const diff = value - base;
  const moneyWeightedPct = base > 0 ? (diff / base) * 100 : null;
  return {
    mode: 'value',
    displayValue: formatted,
    changeDisplay: formatSignedCurrency(diff, currency, locale),
    pctDisplay: moneyWeightedPct == null ? '' : formatSignedPercent(moneyWeightedPct),
    spreadDisplay,
    isPositive: diff >= 0,
  };
};

const getPctHeaderInfo = (point: ChartDataPoint, ppLabel: string): PctHeaderInfo => {
  const { returnPct: pct } = point;
  const spreadDisplay = computeSpread(point, ppLabel);
  if (pct == null) return { mode: 'pct', displayValue: '-', spreadDisplay, isPositive: true };
  return {
    mode: 'pct',
    displayValue: formatPctDisplay(pct),
    spreadDisplay,
    isPositive: pct >= 0,
  };
};

/** Value-mode percent is money-weighted (diff / base) so its sign matches the absolute change;
 *  pct-mode keeps the rebased TWR for benchmark comparison.
 *  Absolute change: "all" period uses value − principal; shorter periods use value − first value. */
export const getHeaderValues = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  viewMode: ViewMode,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
  ppLabel: string,
): HeaderInfo => {
  if (viewMode === 'value') return getValueHeaderInfo(point, first, currency, locale, isAllTime, ppLabel);
  return getPctHeaderInfo(point, ppLabel);
};

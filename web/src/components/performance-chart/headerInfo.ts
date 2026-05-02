import { formatCurrency, formatSignedCurrency, formatSignedPercent } from '../../utils/formatters';
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
  principalDisplay: null,
  changeDisplay: null,
  pctDisplay: '',
  isPositive: true,
};

const getValueHeaderInfo = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
): ValueHeaderInfo => {
  const value = point.currentValue;
  if (value == null) return EMPTY_VALUE_HEADER;

  const formatted = formatCurrency(value, currency, locale);
  const principalDisplay =
    point.principal == null ? null : formatCurrency(point.principal, currency, locale);
  const base = isAllTime ? point.principal : first.currentValue;
  if (base == null) return { ...EMPTY_VALUE_HEADER, displayValue: formatted, principalDisplay };

  const diff = value - base;
  const moneyWeightedPct = base > 0 ? (diff / base) * 100 : null;
  return {
    mode: 'value',
    displayValue: formatted,
    principalDisplay,
    changeDisplay: formatSignedCurrency(diff, currency, locale),
    pctDisplay: moneyWeightedPct == null ? '' : formatSignedPercent(moneyWeightedPct),
    isPositive: diff >= 0,
  };
};

const getPctHeaderInfo = (point: ChartDataPoint): PctHeaderInfo => {
  const { returnPct: pct, sp500ReturnPct: sp500Pct } = point;
  if (pct == null) return { mode: 'pct', displayValue: '-', sp500Display: null, isPositive: true };
  return {
    mode: 'pct',
    displayValue: formatPctDisplay(pct),
    sp500Display: sp500Pct == null ? null : formatPctDisplay(sp500Pct),
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
): HeaderInfo => {
  if (viewMode === 'value') return getValueHeaderInfo(point, first, currency, locale, isAllTime);
  return getPctHeaderInfo(point);
};

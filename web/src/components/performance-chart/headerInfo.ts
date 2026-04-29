import { formatCurrency, formatSignedCurrency, formatSignedPercent } from '../../utils/formatters';
import type { Currency } from '../../hooks/useCurrencyPreference';
import type {
  ChartDataPoint,
  HeaderInfo,
  PctHeaderInfo,
  ValueHeaderInfo,
  ViewMode,
} from './types';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC shift in negative-offset timezones). */
export const parseYMD = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Format a number as a signed percent string (e.g. "+12.34%" or "-5.67%"). */
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

/** Header values for absolute-value mode. */
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
  return {
    mode: 'value',
    displayValue: formatted,
    principalDisplay,
    changeDisplay: formatSignedCurrency(diff, currency, locale),
    pctDisplay: formatSignedPercent(point.returnPct),
    isPositive: diff >= 0,
  };
};

/** Header values for percentage mode. */
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

/** Compute the header display values.
 *  Uses the TWR return_pct (rebased) for the percentage — avoids division by near-zero principal.
 *  Absolute change: "all" period uses value − principal; shorter periods use value − first value. */
export const getHeaderValues = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  viewMode: ViewMode,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
): HeaderInfo => {
  if (viewMode === 'value') {
    return getValueHeaderInfo(point, first, currency, locale, isAllTime);
  }
  return getPctHeaderInfo(point);
};

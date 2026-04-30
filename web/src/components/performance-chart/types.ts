import type { PerformanceDataPoint } from '../../api';
import type { Currency } from '../../hooks/useCurrencyPreference';

export type ViewMode = 'value' | 'pct';

export interface LiveLastPoint {
  currentValue: number;
  /** Live USD→EUR rate (from status response). Used to compute EUR current value. */
  fxRate: number | null;
}

export interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  isLoading?: boolean;
  currency?: Currency;
  liveLastPoint?: LiveLastPoint;
}

export interface ChartDataPoint {
  date: string;
  principal: number | null;
  currentValue: number | null;
  returnPct: number | null;
  sp500ReturnPct: number | null;
}

/** Header display values for value mode. */
export interface ValueHeaderInfo {
  mode: 'value';
  displayValue: string;
  principalDisplay: string | null;
  changeDisplay: string | null;
  pctDisplay: string;
  isPositive: boolean;
}

/** Header display values for percentage mode. */
export interface PctHeaderInfo {
  mode: 'pct';
  displayValue: string;
  sp500Display: string | null;
  isPositive: boolean;
}

export type HeaderInfo = ValueHeaderInfo | PctHeaderInfo;

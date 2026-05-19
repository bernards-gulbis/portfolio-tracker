import { useMemo } from 'react';
import type { PerformanceDataPoint } from '../../api';
import type { Currency } from '../../hooks/useCurrencyPreference';
import { computeBaseFactor, rebasePct } from '../../utils/performanceCalc';
import { type TimePeriod, getCutoffDate } from '../../utils/chartHelpers';
import type { ChartDataPoint, LiveLastPoint } from './types';

/** Filter raw performance series by time period and rebase each return-percentage series so it
 *  starts at 0% on the first visible point. Both portfolio and S&P 500 use the same pattern:
 *
 *      factor_D  = (1 + return_D/100) × fx_D
 *      rebased   = factor_D / factor_0 − 1
 *
 *  The last point may be overridden by `liveLastPoint` when the live status has a fresher
 *  value/FX rate than the persisted history. */
export const useChartData = (
  data: PerformanceDataPoint[],
  timePeriod: TimePeriod,
  currency: Currency,
  liveLastPoint?: LiveLastPoint,
): ChartDataPoint[] =>
  useMemo(() => {
    const cutoff = getCutoffDate(timePeriod);
    const filtered = cutoff ? data.filter((p) => p.date >= cutoff) : data;
    const useEurMode = currency === 'EUR';

    const baseReturnFactor = computeBaseFactor(filtered, (p) => p.return_pct, useEurMode);
    const baseSp500Factor = computeBaseFactor(filtered, (p) => p.sp500_return_pct, useEurMode);
    const lastIndex = filtered.length - 1;

    return filtered.map((point, index) => {
      const liveOverride = index === lastIndex ? liveLastPoint : undefined;
      const effectiveFxRate = liveOverride?.fxRate ?? point.fx_rate;

      const rawCurrentValue = liveOverride ? liveOverride.currentValue : point.current_value;
      const eurCurrentValue =
        rawCurrentValue == null || effectiveFxRate == null
          ? null
          : rawCurrentValue * effectiveFxRate;

      const principal = useEurMode ? point.principal_eur ?? null : point.principal;
      const sp500Pct = rebasePct(
        point.sp500_return_pct,
        effectiveFxRate,
        baseSp500Factor,
        useEurMode,
      );
      // Synthesize an S&P 500 value series only when both principal and S&P return are
      // present. Treats principal as a lump-sum invested in the benchmark — close enough
      // for a visual comparison without overstating precision when deposits are uneven.
      const sp500Value =
        principal == null || sp500Pct == null ? null : principal * (1 + sp500Pct / 100);

      return {
        date: point.date,
        principal,
        currentValue: useEurMode ? eurCurrentValue : rawCurrentValue,
        returnPct: rebasePct(point.return_pct, effectiveFxRate, baseReturnFactor, useEurMode),
        sp500ReturnPct: sp500Pct,
        sp500Value,
      };
    });
  }, [data, timePeriod, currency, liveLastPoint]);

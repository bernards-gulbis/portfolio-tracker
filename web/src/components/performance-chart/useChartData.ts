import { useMemo } from 'react';
import type { PerformanceDataPoint } from '../../api';
import type { Currency } from '../../hooks/useCurrencyPreference';
import { computeBaseFactor, rebasePct } from '../../utils/performanceCalc';
import { type TimePeriod, getCutoffDate } from '../../utils/chartHelpers';
import type { ChartDataPoint, LiveLastPoint } from './types';

/**
 * Filter the raw performance series by the selected time period and rebase
 * each return-percentage series so it starts at 0% on the first visible
 * point. Both portfolio and S&P 500 series use the same FX-adjustment pattern:
 *
 *     factor_D  = (1 + return_D/100) × fx_D
 *     rebased   = factor_D / factor_0 − 1
 *
 * The last point may be overridden by ``liveLastPoint`` (when the live
 * status provides a fresher value/FX rate than the persisted history).
 */
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

    return filtered.map((point, index) => {
      const isLast = index === filtered.length - 1;
      const liveOverride = isLast ? liveLastPoint : undefined;

      const effectiveFxRate =
        isLast && liveOverride?.fxRate != null ? liveOverride.fxRate : point.fx_rate;

      const returnRebased = rebasePct(
        point.return_pct,
        effectiveFxRate,
        baseReturnFactor,
        useEurMode,
      );
      const sp500Rebased = rebasePct(
        point.sp500_return_pct,
        effectiveFxRate,
        baseSp500Factor,
        useEurMode,
      );

      const rawCurrentValue = isLast && liveOverride ? liveOverride.currentValue : point.current_value;
      const eurConvertedValue =
        rawCurrentValue == null ? null : rawCurrentValue * effectiveFxRate!;
      const currentValue = useEurMode
        ? (effectiveFxRate == null ? null : eurConvertedValue)
        : rawCurrentValue;

      const principal = useEurMode ? point.principal_eur ?? null : point.principal;

      return {
        date: point.date,
        principal,
        currentValue,
        returnPct: returnRebased,
        sp500ReturnPct: sp500Rebased,
      };
    });
  }, [data, timePeriod, currency, liveLastPoint]);

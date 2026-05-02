import { useMemo } from 'react';

import type { PortfolioPerformance, PricedPortfolioStatus } from '../../api';
import { MS_PER_DAY } from '../../utils/formatters';

export interface DerivedReturns {
  /** Annualized EUR-adjusted (when ``showEur``) TWR; null if span < 30 days
   *  or there is insufficient data. */
  annualizedReturn: number | null;
}

const MIN_ANNUALIZE_DAYS = 30;

/** Compute the (optionally EUR-adjusted) trailing TWR % from a perf series.
 *  Returns null when the series is too short or its last point is missing.
 *  EUR adjustment formula (matches PerformanceChart):
 *
 *    (1 + return%) × current_fx / ((1 + first_return%) × first_fx) − 1
 */
const computeLastReturnPct = (
  performance: PortfolioPerformance | undefined,
  liveFx: number | null,
  showEur: boolean,
): number | null => {
  const points = performance?.data_points;
  if (points == null || points.length < 2) return null;
  const last = points[points.length - 1];
  if (last.return_pct == null) return null;
  if (!showEur) return last.return_pct;

  const effectiveFxLast = liveFx ?? last.fx_rate;
  const first = points.find((p) => p.return_pct != null && p.fx_rate != null);
  if (first?.return_pct == null || first?.fx_rate == null || effectiveFxLast == null) {
    return last.return_pct;
  }
  const baseFactor = (1 + first.return_pct / 100) * first.fx_rate;
  if (baseFactor <= 0) return null;
  const lastFactor = (1 + last.return_pct / 100) * effectiveFxLast;
  return (lastFactor / baseFactor - 1) * 100;
};

const findStartIdx = (
  points: PortfolioPerformance['data_points'],
  showEur: boolean,
): number =>
  showEur
    ? points.findIndex((p) => p.return_pct != null && p.fx_rate != null)
    : points.findIndex((p) => p.return_pct != null);

export const useDerivedReturns = (
  performance: PortfolioPerformance | undefined,
  status: PricedPortfolioStatus,
  showEur: boolean,
): DerivedReturns => {
  const annualizedReturn = useMemo(() => {
    const lastReturnPct = computeLastReturnPct(performance, status.usd_to_eur_rate, showEur);
    if (lastReturnPct == null) return null;
    const points = performance?.data_points;
    if (points == null || points.length < 2) return null;
    // Use the same start point as computeLastReturnPct so days and return
    // are measured from the same origin.
    const startIdx = findStartIdx(points, showEur);
    if (startIdx < 0) return null;
    const firstMs = new Date(points[startIdx].date).getTime();
    const lastMs = new Date(points[points.length - 1].date).getTime();
    const days = Math.max(1, (lastMs - firstMs) / MS_PER_DAY);
    if (days < MIN_ANNUALIZE_DAYS) return null;
    return (Math.pow(1 + lastReturnPct / 100, 365 / days) - 1) * 100;
  }, [performance, showEur, status.usd_to_eur_rate]);

  return { annualizedReturn };
};

// Exported for unit testing the EUR-adjustment formula directly.
export const _computeLastReturnPctForTests = computeLastReturnPct;

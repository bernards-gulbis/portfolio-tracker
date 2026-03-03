import type { PerformanceDataPoint } from '../api';

/** Compute FX-adjusted rebase factor for the first visible point of a series. */
export const computeBaseFactor = (
  points: PerformanceDataPoint[],
  getPct: (p: PerformanceDataPoint) => number | null,
  useEur: boolean,
): number | null => {
  const first = points.find(p => getPct(p) != null && (!useEur || p.fx_rate != null));
  if (!first) return null;
  const pct = getPct(first);
  if (pct == null) return null;
  const factor = 1 + pct / 100;
  return useEur && first.fx_rate != null ? factor * first.fx_rate : factor;
};

/** Rebase a single return % relative to the base factor, with optional FX adjustment. */
export const rebasePct = (
  rawPct: number | null,
  fxRate: number | null,
  baseFactor: number | null,
  useEur: boolean,
): number | null => {
  if (rawPct == null || baseFactor == null || baseFactor === 0) return null;
  const factor = 1 + rawPct / 100;
  const adjusted = useEur && fxRate != null ? factor * fxRate : factor;
  return (adjusted / baseFactor - 1) * 100;
};

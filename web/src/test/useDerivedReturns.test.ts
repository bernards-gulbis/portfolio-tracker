import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useDerivedReturns,
  _computeLastReturnPctForTests as computeLastReturnPct,
} from '../components/portfolio-status/useDerivedReturns';
import type { PerformanceDataPoint, PortfolioPerformance, PricedPortfolioStatus } from '../api';

const point = (overrides: Partial<PerformanceDataPoint>): PerformanceDataPoint => ({
  date: '2024-01-01',
  principal: 0,
  principal_eur: null,
  current_value: null,
  fx_rate: null,
  return_pct: null,
  sp500_return_pct: null,
  ...overrides,
});

const makePerformance = (data_points: PerformanceDataPoint[]): PortfolioPerformance => ({
  portfolio_id: 1,
  portfolio_name: 'p',
  data_points,
  cost_basis_fallback_tickers: [],
});

const baseStatus = {
  usd_to_eur_rate: null,
} as unknown as PricedPortfolioStatus;

describe('computeLastReturnPct', () => {
  it('returns null when performance is undefined', () => {
    expect(computeLastReturnPct(undefined, null, false)).toBeNull();
  });

  it('returns null when fewer than 2 points', () => {
    const perf = makePerformance([point({ return_pct: 5 })]);
    expect(computeLastReturnPct(perf, null, false)).toBeNull();
  });

  it('returns null when last point return_pct is null', () => {
    const perf = makePerformance([point({ return_pct: 5 }), point({ return_pct: null })]);
    expect(computeLastReturnPct(perf, null, false)).toBeNull();
  });

  it('returns last return_pct unchanged in USD mode', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      point({ date: '2024-12-31', return_pct: 12.5, fx_rate: 0.95 }),
    ]);
    expect(computeLastReturnPct(perf, 0.95, false)).toBe(12.5);
  });

  it('falls back to raw return_pct in EUR mode when no point has fx_rate', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: null }),
      point({ date: '2024-12-31', return_pct: 10, fx_rate: null }),
    ]);
    // No point passes the (return_pct != null && fx_rate != null) filter →
    // fallback returns ``last.return_pct`` even when liveFx is provided.
    expect(computeLastReturnPct(perf, 0.95, true)).toBe(10);
  });

  it('applies EUR adjustment using live fx and first usable point', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      point({ date: '2024-06-01', return_pct: 5, fx_rate: 0.92 }),
      point({ date: '2024-12-31', return_pct: 10, fx_rate: 0.94 }),
    ]);
    // baseFactor = (1 + 0/100) × 0.9 = 0.9
    // lastFactor = (1 + 10/100) × 0.95 (live fx) = 1.045
    // result = (1.045 / 0.9 − 1) × 100 ≈ 16.111%
    const result = computeLastReturnPct(perf, 0.95, true)!;
    expect(result).toBeCloseTo(((1.1 * 0.95) / 0.9 - 1) * 100, 6);
  });

  it('uses last point fx_rate when live fx is null', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      point({ date: '2024-12-31', return_pct: 10, fx_rate: 0.94 }),
    ]);
    // baseFactor = 0.9, lastFactor = 1.1 × 0.94 = 1.034, → 14.888…%
    const result = computeLastReturnPct(perf, null, true)!;
    expect(result).toBeCloseTo(((1.1 * 0.94) / 0.9 - 1) * 100, 6);
  });

  it('returns null when baseFactor is non-positive', () => {
    // first.return_pct = -150 → (1 + -150/100) = -0.5 × fx 0.9 = -0.45 (≤ 0)
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: -150, fx_rate: 0.9 }),
      point({ date: '2024-12-31', return_pct: 10, fx_rate: 0.94 }),
    ]);
    expect(computeLastReturnPct(perf, 0.95, true)).toBeNull();
  });
});

describe('useDerivedReturns annualization', () => {
  const status = (rate: number | null): PricedPortfolioStatus =>
    ({ ...baseStatus, usd_to_eur_rate: rate } as PricedPortfolioStatus);

  it('returns null when last return is null', () => {
    const perf = makePerformance([point({ return_pct: 5 })]); // < 2 points
    const { result } = renderHook(() =>
      useDerivedReturns(perf, status(null), false),
    );
    expect(result.current.annualizedReturn).toBeNull();
  });

  it('returns null when span < 30 days', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      point({ date: '2024-01-20', return_pct: 5, fx_rate: 0.9 }),
    ]);
    const { result } = renderHook(() =>
      useDerivedReturns(perf, status(0.9), false),
    );
    expect(result.current.annualizedReturn).toBeNull();
  });

  it('annualizes correctly over a one-year span (USD)', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      point({ date: '2024-12-31', return_pct: 10, fx_rate: 0.95 }),
    ]);
    const { result } = renderHook(() =>
      useDerivedReturns(perf, status(0.95), false),
    );
    // 365 days, raw 10% → (1.1)^(365/365) − 1 = 10%
    expect(result.current.annualizedReturn).toBeCloseTo(10, 4);
  });

  it('annualizes a 6-month half-year (USD): doubles roughly', () => {
    const perf = makePerformance([
      point({ date: '2024-01-01', return_pct: 0, fx_rate: 0.9 }),
      // ~183 days later
      point({ date: '2024-07-02', return_pct: 10, fx_rate: 0.9 }),
    ]);
    const { result } = renderHook(() =>
      useDerivedReturns(perf, status(0.9), false),
    );
    // (1.1)^(365/183) − 1 ≈ 0.21 (21%)
    const expected = (Math.pow(1.1, 365 / 183) - 1) * 100;
    expect(result.current.annualizedReturn).toBeCloseTo(expected, 4);
  });
});

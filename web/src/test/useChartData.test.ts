import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartData } from '../components/performance-chart/useChartData';
import type { PerformanceDataPoint } from '../api';

afterEach(() => vi.useRealTimers());

const pt = (overrides: Partial<PerformanceDataPoint>): PerformanceDataPoint => ({
  date: '2026-01-01',
  principal: 10000,
  principal_eur: 9000,
  current_value: 11000,
  fx_rate: 0.9,
  return_pct: 10,
  sp500_return_pct: 5,
  ...overrides,
});

const data: PerformanceDataPoint[] = [
  pt({ date: '2026-04-01', return_pct: 0, sp500_return_pct: 0, fx_rate: 0.9, current_value: 10000, principal_eur: 9000 }),
  pt({ date: '2026-04-15', return_pct: 5, sp500_return_pct: 2, fx_rate: 0.91, current_value: 10500, principal_eur: 9000 }),
  pt({ date: '2026-05-01', return_pct: 10, sp500_return_pct: 4, fx_rate: 0.92, current_value: 11000, principal_eur: 9000 }),
];

describe('useChartData — USD mode', () => {
  it('returns USD current values when currency is USD', () => {
    const { result } = renderHook(() => useChartData(data, 'all', 'USD'));
    const points = result.current;
    expect(points).toHaveLength(3);
    expect(points[0].currentValue).toBe(10000);
    expect(points[2].currentValue).toBe(11000);
  });

  it('returns USD principal when currency is USD', () => {
    const { result } = renderHook(() => useChartData(data, 'all', 'USD'));
    expect(result.current[0].principal).toBe(10000);
  });

  it('rebases returnPct so the first visible point is 0', () => {
    const { result } = renderHook(() => useChartData(data, 'all', 'USD'));
    expect(result.current[0].returnPct).toBeCloseTo(0, 4);
    expect(result.current[1].returnPct).toBeGreaterThan(0);
  });

  it('filters to the specified time period', () => {
    // Freeze today to 2026-05-09 so the 1-month cutoff is deterministically 2026-04-09.
    // Only 2026-04-15 and 2026-05-01 pass; 2026-04-01 is excluded.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09'));
    const { result } = renderHook(() => useChartData(data, '1month', 'USD'));
    expect(result.current.length).toBe(2);
    expect(result.current[result.current.length - 1].date).toBe('2026-05-01');
  });
});

describe('useChartData — EUR mode', () => {
  it('returns EUR current values (raw × fx_rate) when currency is EUR', () => {
    const { result } = renderHook(() => useChartData(data, 'all', 'EUR'));
    const first = result.current[0];
    // 10000 * 0.9 = 9000
    expect(first.currentValue).toBeCloseTo(9000, 4);
  });

  it('returns principal_eur when currency is EUR', () => {
    const { result } = renderHook(() => useChartData(data, 'all', 'EUR'));
    expect(result.current[0].principal).toBe(9000);
  });

  it('returns null currentValue when fx_rate is null in EUR mode', () => {
    const dataWithNullFx: PerformanceDataPoint[] = [
      pt({ date: '2026-04-01', return_pct: 0, fx_rate: null, current_value: 10000 }),
      pt({ date: '2026-05-01', return_pct: 10, fx_rate: null, current_value: 11000 }),
    ];
    const { result } = renderHook(() => useChartData(dataWithNullFx, 'all', 'EUR'));
    expect(result.current[0].currentValue).toBeNull();
  });

  it('returns null returnPct when no base factor can be computed (all fx_rate null in EUR mode)', () => {
    const dataNoFx: PerformanceDataPoint[] = [
      pt({ date: '2026-04-01', return_pct: 0, fx_rate: null }),
      pt({ date: '2026-05-01', return_pct: 10, fx_rate: null }),
    ];
    const { result } = renderHook(() => useChartData(dataNoFx, 'all', 'EUR'));
    // baseFactor is null → rebasePct returns null
    expect(result.current[0].returnPct).toBeNull();
    expect(result.current[1].returnPct).toBeNull();
  });
});

describe('useChartData — liveLastPoint override', () => {
  it('overrides the last point currentValue with liveLastPoint.currentValue in USD mode', () => {
    const liveLastPoint = { currentValue: 12500, fxRate: 0.93 };
    const { result } = renderHook(() =>
      useChartData(data, 'all', 'USD', liveLastPoint),
    );
    const points = result.current;
    // Last point should use live currentValue instead of 11000
    expect(points[points.length - 1].currentValue).toBe(12500);
    // Earlier points are unchanged
    expect(points[0].currentValue).toBe(10000);
  });

  it('overrides the last point EUR currentValue using liveLastPoint.fxRate in EUR mode', () => {
    const liveLastPoint = { currentValue: 12000, fxRate: 0.95 };
    const { result } = renderHook(() =>
      useChartData(data, 'all', 'EUR', liveLastPoint),
    );
    const points = result.current;
    // Last EUR value = 12000 * 0.95 = 11400
    expect(points[points.length - 1].currentValue).toBeCloseTo(11400, 4);
  });

  it('non-last points are not affected by liveLastPoint', () => {
    const liveLastPoint = { currentValue: 99999, fxRate: 0.99 };
    const { result } = renderHook(() =>
      useChartData(data, 'all', 'USD', liveLastPoint),
    );
    const points = result.current;
    expect(points[0].currentValue).toBe(10000);
    expect(points[1].currentValue).toBe(10500);
  });

  it('uses liveLastPoint.fxRate for rebased returnPct in EUR mode for the last point', () => {
    const liveLastPoint = { currentValue: 11000, fxRate: 0.95 };
    const { result } = renderHook(() =>
      useChartData(data, 'all', 'EUR', liveLastPoint),
    );
    const points = result.current;
    // The last returnPct should not be null
    expect(points[points.length - 1].returnPct).not.toBeNull();
  });

  it('falls back to point.fx_rate when liveLastPoint.fxRate is null', () => {
    // fxRate: null — effectiveFxRate should fall through to point.fx_rate (0.92)
    const liveLastPoint = { currentValue: 12000, fxRate: null };
    const { result } = renderHook(() =>
      useChartData(data, 'all', 'EUR', liveLastPoint),
    );
    const points = result.current;
    // EUR value = 12000 * point.fx_rate(0.92) = 11040
    expect(points[points.length - 1].currentValue).toBeCloseTo(11040, 4);
  });
});

describe('useChartData — empty / edge cases', () => {
  it('returns an empty array when data is empty', () => {
    const { result } = renderHook(() => useChartData([], 'all', 'USD'));
    expect(result.current).toEqual([]);
  });

  it('returns an empty array when all points are filtered out by time period', () => {
    const oldData: PerformanceDataPoint[] = [
      pt({ date: '2020-01-01', return_pct: 0 }),
      pt({ date: '2020-06-01', return_pct: 5 }),
    ];
    // '1month' cutoff is ~2026-04-09 — all 2020 points are filtered
    const { result } = renderHook(() => useChartData(oldData, '1month', 'USD'));
    expect(result.current).toEqual([]);
  });

  it('returns null sp500ReturnPct when sp500_return_pct is null', () => {
    const dataNoSp: PerformanceDataPoint[] = [
      pt({ date: '2026-04-01', return_pct: 0, sp500_return_pct: null }),
      pt({ date: '2026-05-01', return_pct: 10, sp500_return_pct: null }),
    ];
    const { result } = renderHook(() => useChartData(dataNoSp, 'all', 'USD'));
    expect(result.current[0].sp500ReturnPct).toBeNull();
    expect(result.current[1].sp500ReturnPct).toBeNull();
  });
});

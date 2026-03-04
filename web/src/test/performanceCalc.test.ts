import { describe, it, expect } from 'vitest';
import { computeBaseFactor, rebasePct } from '../utils/performanceCalc';
import type { PerformanceDataPoint } from '../api';

const point = (pct: number | null, fxRate: number | null = null): PerformanceDataPoint => ({
  date: '2024-01-01',
  principal: 1000,
  principal_eur: null,
  current_value: 1100,
  fx_rate: fxRate,
  return_pct: pct,
  sp500_return_pct: null,
});

describe('computeBaseFactor', () => {
  const getPct = (p: PerformanceDataPoint) => p.return_pct;

  it('returns factor = 1 + pct/100 in USD mode', () => {
    const points = [point(10)];
    expect(computeBaseFactor(points, getPct, false)).toBeCloseTo(1.1);
  });

  it('returns factor * fx_rate in EUR mode', () => {
    const points = [point(10, 0.85)];
    expect(computeBaseFactor(points, getPct, true)).toBeCloseTo(1.1 * 0.85);
  });

  it('skips points with null return_pct', () => {
    const points = [point(null), point(5)];
    expect(computeBaseFactor(points, getPct, false)).toBeCloseTo(1.05);
  });

  it('skips points with null fx_rate in EUR mode', () => {
    const points = [point(10, null), point(5, 0.9)];
    expect(computeBaseFactor(points, getPct, true)).toBeCloseTo(1.05 * 0.9);
  });

  it('returns null when all points have null return_pct', () => {
    const points = [point(null), point(null)];
    expect(computeBaseFactor(points, getPct, false)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(computeBaseFactor([], getPct, false)).toBeNull();
  });

  it('works with 0% return (factor = 1)', () => {
    const points = [point(0)];
    expect(computeBaseFactor(points, getPct, false)).toBeCloseTo(1.0);
  });

  it('works with negative return', () => {
    const points = [point(-20)];
    expect(computeBaseFactor(points, getPct, false)).toBeCloseTo(0.8);
  });
});

describe('rebasePct', () => {
  it('rebases USD return relative to base', () => {
    // base = 1.1 (10%), raw = 21% => factor = 1.21
    // rebased = (1.21 / 1.1 - 1) * 100 = 10%
    expect(rebasePct(21, null, 1.1, false)).toBeCloseTo(10);
  });

  it('rebases to 0% when rawPct matches the base', () => {
    expect(rebasePct(10, null, 1.1, false)).toBeCloseTo(0);
  });

  it('applies FX adjustment in EUR mode', () => {
    // base = 1.1 * 0.85, raw = 10%, fxRate = 0.90
    // adjusted = 1.1 * 0.90, rebased = (1.1*0.90 / (1.1*0.85) - 1) * 100
    const base = 1.1 * 0.85;
    expect(rebasePct(10, 0.9, base, true)).toBeCloseTo((1.1 * 0.9 / base - 1) * 100);
  });

  it('returns null for null rawPct', () => {
    expect(rebasePct(null, null, 1.1, false)).toBeNull();
  });

  it('returns null for null baseFactor', () => {
    expect(rebasePct(10, null, null, false)).toBeNull();
  });

  it('returns null when baseFactor is 0', () => {
    expect(rebasePct(10, null, 0, false)).toBeNull();
  });

  it('handles negative base correctly', () => {
    // baseFactor <= 0 is guarded
    expect(rebasePct(10, null, -1, false)).toBeNull();
  });

  it('falls back to USD when fxRate is null in EUR mode', () => {
    // When fxRate is null and useEur=true, factor = 1 + rawPct/100 (no FX applied)
    expect(rebasePct(10, null, 1.1, true)).toBeCloseTo(0);
  });
});

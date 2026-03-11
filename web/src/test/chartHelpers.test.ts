import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatCompactValue, subtractMonths, getCutoffDate } from '../utils/chartHelpers';

describe('formatCompactValue', () => {
  it('formats millions with one decimal', () => {
    expect(formatCompactValue(1_500_000, 'USD')).toBe('$1.5M');
    expect(formatCompactValue(2_000_000, 'EUR')).toBe('€2.0M');
  });

  it('formats thousands with no decimal', () => {
    expect(formatCompactValue(25_000, 'USD')).toBe('$25k');
    expect(formatCompactValue(1_000, 'EUR')).toBe('€1k');
  });

  it('formats values below 1000 as integers', () => {
    expect(formatCompactValue(500, 'USD')).toBe('$500');
    expect(formatCompactValue(0, 'EUR')).toBe('€0');
  });

  it('formats negative values correctly', () => {
    expect(formatCompactValue(-25_000, 'USD')).toBe('$-25k');
    expect(formatCompactValue(-1_500_000, 'EUR')).toBe('€-1.5M');
  });

  it('promotes k to M at the boundary', () => {
    expect(formatCompactValue(999_499, 'USD')).toBe('$999k');
    expect(formatCompactValue(999_500, 'USD')).toBe('$1.0M');
    expect(formatCompactValue(1_000_000, 'EUR')).toBe('€1.0M');
  });
});

describe('getCutoffDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for "all" period', () => {
    expect(getCutoffDate('all')).toBeNull();
  });

  it('returns Jan 1 of current year for "ytd"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
    expect(getCutoffDate('ytd')).toBe('2026-01-01');
  });

  it('returns exact date 1 month ago for "1month"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
    expect(getCutoffDate('1month')).toBe('2026-02-11');
  });

  it('returns exact date 3 months ago for "3month"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
    expect(getCutoffDate('3month')).toBe('2025-12-11');
  });

  it('returns exact date 6 months ago for "6month"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
    expect(getCutoffDate('6month')).toBe('2025-09-11');
  });

  it('returns exact date 1 year ago for "1year"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 11)); // March 11, 2026
    expect(getCutoffDate('1year')).toBe('2025-03-11');
  });

  it('clamps month-end when subtracting months', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31)); // March 31, 2026
    expect(getCutoffDate('1month')).toBe('2026-02-28');
  });
});

describe('subtractMonths', () => {
  it('clamps day when target month is shorter', () => {
    // March 31 - 1 month → Feb 28 (non-leap year 2025)
    const march31 = new Date(2025, 2, 31); // March 31, 2025
    const result = subtractMonths(march31, 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it('subtracts months normally when day fits', () => {
    const march15 = new Date(2025, 2, 15);
    const result = subtractMonths(march15, 1);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(15);
  });
});

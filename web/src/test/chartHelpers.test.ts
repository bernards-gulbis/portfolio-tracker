import { describe, it, expect } from 'vitest';
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
  it('returns null for "all" period', () => {
    expect(getCutoffDate('all')).toBeNull();
  });

  it('returns Jan 1 of current year for "ytd"', () => {
    const result = getCutoffDate('ytd');
    const year = new Date().getFullYear();
    expect(result).toBe(`${year}-01-01`);
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

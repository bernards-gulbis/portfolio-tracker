import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDateTime, formatSignedPercent, getValueClass, toLocalDateStr } from '../utils/formatters';

describe('Formatters', () => {
  describe('formatCurrency', () => {
    it('formats USD currency correctly', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(-500.5)).toBe('-$500.50');
    });

    it('formats EUR currency correctly', () => {
      expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00');
      expect(formatCurrency(2760.27, 'EUR')).toBe('€2,760.27');
    });
  });

  describe('formatDateTime', () => {
    it('formats date correctly', () => {
      const date = '2020-12-02T20:14:40';
      const formatted = formatDateTime(date);
      expect(formatted).toContain('Dec');
      expect(formatted).toContain('2020');
    });
  });

  describe('formatSignedPercent', () => {
    it('returns dash for null', () => {
      expect(formatSignedPercent(null)).toBe('-');
    });

    it('returns dash for undefined', () => {
      expect(formatSignedPercent(undefined)).toBe('-');
    });

    it('shows up arrow for positive', () => {
      const result = formatSignedPercent(5.25);
      expect(result).toBe('\u25B25.25%');
    });

    it('shows down arrow for negative', () => {
      const result = formatSignedPercent(-3.1);
      expect(result).toBe('\u25BC3.10%');
    });

    it('shows up arrow for zero', () => {
      const result = formatSignedPercent(0);
      expect(result).toBe('\u25B20.00%');
    });
  });

  describe('getValueClass', () => {
    it('returns empty string for null', () => {
      expect(getValueClass(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(getValueClass(undefined)).toBe('');
    });

    it('returns text-positive for positive value', () => {
      expect(getValueClass(10)).toBe('text-positive');
    });

    it('returns text-negative for negative value', () => {
      expect(getValueClass(-5)).toBe('text-negative');
    });

    it('returns text-positive for zero', () => {
      expect(getValueClass(0)).toBe('text-positive');
    });
  });

  describe('toLocalDateStr', () => {
    it('formats date as YYYY-MM-DD', () => {
      const d = new Date(2024, 0, 15); // Jan 15 2024
      expect(toLocalDateStr(d)).toBe('2024-01-15');
    });

    it('pads single-digit month and day', () => {
      const d = new Date(2024, 2, 5); // Mar 5 2024
      expect(toLocalDateStr(d)).toBe('2024-03-05');
    });
  });

});

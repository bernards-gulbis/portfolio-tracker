import { describe, it, expect } from 'vitest';
import { formatCurrency, formatSignedCurrency, formatDateTime, formatSignedPercent, formatDaysHeld, getValueClass, toLocalDateStr } from '../utils/formatters';

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

  describe('formatSignedCurrency', () => {
    it('returns dash for null', () => {
      expect(formatSignedCurrency(null)).toBe('-');
    });

    it('returns dash for undefined', () => {
      expect(formatSignedCurrency(undefined)).toBe('-');
    });

    it('prepends + for positive values', () => {
      expect(formatSignedCurrency(500)).toBe('+$500.00');
    });

    it('does not prepend sign for negative values (negative sign is included)', () => {
      expect(formatSignedCurrency(-250)).toBe('-$250.00');
    });

    it('does not prepend + for zero', () => {
      expect(formatSignedCurrency(0)).toBe('$0.00');
    });

    it('supports EUR currency', () => {
      expect(formatSignedCurrency(1000, 'EUR')).toBe('+€1,000.00');
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

  describe('formatDaysHeld', () => {
    it('shows days only for < 31', () => {
      expect(formatDaysHeld(0)).toBe('0d');
      expect(formatDaysHeld(1)).toBe('1d');
      expect(formatDaysHeld(15)).toBe('15d');
      expect(formatDaysHeld(30)).toBe('30d');
    });

    it('shows months and days for 31–365', () => {
      expect(formatDaysHeld(31)).toBe('1m 1d');
      expect(formatDaysHeld(60)).toBe('2m');
      expect(formatDaysHeld(102)).toBe('3m 12d');
      expect(formatDaysHeld(365)).toBe('12m 5d');
    });

    it('shows years and months for > 365', () => {
      expect(formatDaysHeld(366)).toBe('1y');
      expect(formatDaysHeld(547)).toBe('1y 6m');
      expect(formatDaysHeld(730)).toBe('2y');
      expect(formatDaysHeld(800)).toBe('2y 2m');
    });

    it('uses custom labels', () => {
      const labels = { d: 'д', m: 'мес', y: 'г' };
      expect(formatDaysHeld(15, labels)).toBe('15д');
      expect(formatDaysHeld(102, labels)).toBe('3мес 12д');
      expect(formatDaysHeld(547, labels)).toBe('1г 6мес');
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

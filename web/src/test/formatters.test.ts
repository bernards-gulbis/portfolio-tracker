import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatSignedCurrency,
  formatDateTime,
  formatSignedPercent,
  formatDaysHeld,
  formatQuantity,
  getValueClass,
  toLocalDateStr,
  formatTaxRatePercent,
  daysSinceLocalDate,
} from '../utils/formatters';

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

  describe('formatQuantity', () => {
    it('strips trailing zeros from whole and fractional values', () => {
      expect(formatQuantity(0)).toBe('0');
      expect(formatQuantity(5)).toBe('5');
      expect(formatQuantity(1.5)).toBe('1.5');
      expect(formatQuantity(-2.25)).toBe('-2.25');
    });

    it('keeps up to 8 decimals of precision', () => {
      expect(formatQuantity(1.23456789)).toBe('1.23456789');
      expect(formatQuantity(0.00000001)).toBe('0.00000001');
    });

    it('rounds to 8 decimals when input has more', () => {
      expect(formatQuantity(1.123456789)).toBe('1.12345679');
    });
  });

  describe('formatTaxRatePercent', () => {
    it('returns whole numbers without trailing zeros', () => {
      expect(formatTaxRatePercent(0.25)).toBe('25');
      expect(formatTaxRatePercent(0.2)).toBe('20');
      expect(formatTaxRatePercent(1)).toBe('100');
      expect(formatTaxRatePercent(0)).toBe('0');
    });

    it('preserves fractional percents', () => {
      // Regression: 0.215 used to render as "21" (toFixed(1).replace(/\.0$/,''))
      expect(formatTaxRatePercent(0.215)).toBe('21.5');
      expect(formatTaxRatePercent(0.2755)).toBe('27.55');
      expect(formatTaxRatePercent(0.9999)).toBe('99.99');
    });

    it('rounds to two decimal places max', () => {
      expect(formatTaxRatePercent(0.255123)).toBe('25.51');
      expect(formatTaxRatePercent(0.001)).toBe('0.1');
    });
  });

  describe('daysSinceLocalDate', () => {
    it('returns whole days from a YYYY-MM-DD string to a reference date', () => {
      // Reference: 2026-04-24 local midnight
      const now = new Date(2026, 3, 24).getTime();
      expect(daysSinceLocalDate('2026-04-24', now)).toBe(0);
      expect(daysSinceLocalDate('2026-04-23', now)).toBe(1);
      expect(daysSinceLocalDate('2026-01-01', now)).toBe(113);
    });

    it('does not shift by one day in negative-UTC timezones', () => {
      // Regression: the old implementation appended 'T00:00:00Z' which
      // parses as UTC. In a US-Eastern browser, "2024-01-01" UTC is
      // "2023-12-31 19:00" local, shifting "days since" by one.
      // The new implementation must parse as local time so the same
      // input string produces the same result regardless of the browser's
      // offset.
      const now = new Date(2024, 5, 1).getTime(); // 2024-06-01 local
      expect(daysSinceLocalDate('2024-06-01', now)).toBe(0);
      expect(daysSinceLocalDate('2024-05-01', now)).toBe(31);
    });

    it('ignores a time suffix and uses the date-only portion', () => {
      const now = new Date(2024, 0, 15).getTime();
      expect(daysSinceLocalDate('2024-01-10T14:30:00Z', now)).toBe(5);
      expect(daysSinceLocalDate('2024-01-10T14:30:00', now)).toBe(5);
    });
  });

});

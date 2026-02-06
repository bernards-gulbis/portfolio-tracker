import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, getValueColor, getDisplayValue } from '../utils/formatters';
import { Transaction, TransactionType } from '../api';

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

  describe('formatDate', () => {
    it('formats date correctly', () => {
      const date = '2020-12-02T20:14:40';
      const formatted = formatDate(date);
      expect(formatted).toContain('Dec');
      expect(formatted).toContain('2020');
    });
  });

  describe('getValueColor', () => {
    it('returns positive for positive value', () => {
      expect(getValueColor(3000)).toBe('positive');
    });

    it('returns negative for negative value', () => {
      expect(getValueColor(-2755.35)).toBe('negative');
    });

    it('returns neutral for zero', () => {
      expect(getValueColor(0)).toBe('neutral');
    });

    it('returns neutral for null', () => {
      expect(getValueColor(null)).toBe('neutral');
    });

    it('returns neutral for undefined', () => {
      expect(getValueColor(undefined)).toBe('neutral');
    });
  });

  describe('getDisplayValue', () => {
    it('returns positive value for deposit', () => {
      const transaction: Transaction = {
        id: 1,
        portfolio_id: 1,
        date: '2020-12-02T20:14:40',
        type: TransactionType.DEPOSIT,
        ticker: null,
        quantity: null,
        price_per_share: null,
        fee: 0,
        total_amount: 3000,  // Stored as positive
        eur_amount: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(3000);
    });

    it('returns negative value for buy', () => {
      const transaction: Transaction = {
        id: 2,
        portfolio_id: 1,
        date: '2020-12-02T20:16:10',
        type: TransactionType.BUY,
        ticker: 'MSFT',
        quantity: 15,
        price_per_share: 183.69,
        fee: 0,
        total_amount: -2755.35,  // Now stored as negative
        eur_amount: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-2755.35);
    });

    it('returns negative value for withdraw', () => {
      const transaction: Transaction = {
        id: 3,
        portfolio_id: 1,
        date: '2021-01-10T10:00:00',
        type: TransactionType.WITHDRAW,
        ticker: null,
        quantity: null,
        price_per_share: null,
        fee: 0,
        total_amount: -500,  // Now stored as negative
        eur_amount: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-500);
    });

    it('returns negative value for fee', () => {
      const transaction: Transaction = {
        id: 4,
        portfolio_id: 1,
        date: '2021-02-05T14:30:00',
        type: TransactionType.FEE,
        ticker: null,
        quantity: null,
        price_per_share: null,
        fee: 0,
        total_amount: -10,  // Now stored as negative
        eur_amount: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-10);
    });

    it('returns positive value for sell', () => {
      const transaction: Transaction = {
        id: 5,
        portfolio_id: 1,
        date: '2021-03-15T11:20:00',
        type: TransactionType.SELL,
        ticker: 'AAPL',
        quantity: 10,
        price_per_share: 125.50,
        fee: 5,
        total_amount: 1250,  // Stored as positive
        eur_amount: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(1250);
    });
  });
});

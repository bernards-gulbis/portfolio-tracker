import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, getTransactionColor, getDisplayValue } from '../utils/formatters';
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

  describe('getTransactionColor', () => {
    it('returns positive for deposit', () => {
      const transaction: Transaction = {
        id: 1,
        portfolio_id: 1,
        date_time: '2020-12-02T20:14:40',
        type: TransactionType.DEPOSIT,
        ticker: null,
        units: null,
        price: null,
        fee: 0,
        value: 3000,
        value_eur: null,
        split_ratio: null,
      };
      expect(getTransactionColor(transaction)).toBe('positive');
    });

    it('returns negative for buy', () => {
      const transaction: Transaction = {
        id: 2,
        portfolio_id: 1,
        date_time: '2020-12-02T20:16:10',
        type: TransactionType.BUY,
        ticker: 'MSFT',
        units: 15,
        price: 183.69,
        fee: 0,
        value: 2755.35,  // Now stored as positive
        value_eur: null,
        split_ratio: null,
      };
      expect(getTransactionColor(transaction)).toBe('negative');
    });

    it('returns neutral for split', () => {
      const transaction: Transaction = {
        id: 3,
        portfolio_id: 1,
        date_time: '2021-03-10T09:00:00',
        type: TransactionType.SPLIT,
        ticker: 'AAPL',
        units: null,
        price: null,
        fee: 0,
        value: 0,
        value_eur: null,
        split_ratio: 2.0,
      };
      expect(getTransactionColor(transaction)).toBe('neutral');
    });
  });

  describe('getDisplayValue', () => {
    it('returns positive value for deposit', () => {
      const transaction: Transaction = {
        id: 1,
        portfolio_id: 1,
        date_time: '2020-12-02T20:14:40',
        type: TransactionType.DEPOSIT,
        ticker: null,
        units: null,
        price: null,
        fee: 0,
        value: 3000,
        value_eur: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(3000);
    });

    it('returns negative value for buy', () => {
      const transaction: Transaction = {
        id: 2,
        portfolio_id: 1,
        date_time: '2020-12-02T20:16:10',
        type: TransactionType.BUY,
        ticker: 'MSFT',
        units: 15,
        price: 183.69,
        fee: 0,
        value: 2755.35,
        value_eur: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-2755.35);
    });

    it('returns negative value for withdraw', () => {
      const transaction: Transaction = {
        id: 3,
        portfolio_id: 1,
        date_time: '2021-01-10T10:00:00',
        type: TransactionType.WITHDRAW,
        ticker: null,
        units: null,
        price: null,
        fee: 0,
        value: 500,  // Stored as positive
        value_eur: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-500);
    });

    it('returns negative value for fee', () => {
      const transaction: Transaction = {
        id: 4,
        portfolio_id: 1,
        date_time: '2021-02-05T14:30:00',
        type: TransactionType.FEE,
        ticker: null,
        units: null,
        price: null,
        fee: 0,
        value: 10,  // Stored as positive
        value_eur: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(-10);
    });

    it('returns positive value for sell', () => {
      const transaction: Transaction = {
        id: 5,
        portfolio_id: 1,
        date_time: '2021-03-15T11:20:00',
        type: TransactionType.SELL,
        ticker: 'AAPL',
        units: 10,
        price: 125.50,
        fee: 5,
        value: 1250,  // Stored as positive
        value_eur: null,
        split_ratio: null,
      };
      expect(getDisplayValue(transaction)).toBe(1250);
    });
  });
});

import { describe, it, expect } from 'vitest';

import { TransactionType } from '../api';
import { schema } from '../components/transaction-form/schema';

/**
 * Regression guard for the NaN/Infinity leak in the numeric validators.
 * A bare ``Number.parseFloat(x) <= 0`` check silently admits "abc" (parses to
 * NaN, which is not <= 0) and "Infinity" (also not <= 0), which would flow
 * into buildTransactionData and produce JSON-null quantity/price values —
 * a ghost transaction on the backend.
 */

const validBuy = {
  date: '2024-01-01',
  time: '10:00:00',
  type: TransactionType.BUY,
  ticker: 'AAPL',
  quantity: '5',
  pricePerShare: '100',
  fee: '0',
  totalAmount: '500',
  valueEur: '',
  splitRatio: '',
  fxRate: '',
};

const pathsWithIssue = (result: ReturnType<typeof schema.safeParse>) => {
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join('.'));
};

describe('transaction-form schema — numeric validation', () => {
  it('accepts a valid BUY', () => {
    const result = schema.safeParse(validBuy);
    expect(result.success).toBe(true);
  });

  it.each([
    ['abc', 'quantity'],
    ['Infinity', 'quantity'],
    ['-Infinity', 'quantity'],
    ['', 'quantity'],
    ['0', 'quantity'],
    ['-5', 'quantity'],
  ])('rejects quantity=%s on BUY', (value, expectedPath) => {
    const result = schema.safeParse({ ...validBuy, quantity: value });
    expect(result.success).toBe(false);
    expect(pathsWithIssue(result)).toContain(expectedPath);
  });

  it.each([
    ['abc', 'pricePerShare'],
    ['Infinity', 'pricePerShare'],
    ['0', 'pricePerShare'],
  ])('rejects pricePerShare=%s on SELL', (value, expectedPath) => {
    const result = schema.safeParse({
      ...validBuy,
      type: TransactionType.SELL,
      pricePerShare: value,
    });
    expect(result.success).toBe(false);
    expect(pathsWithIssue(result)).toContain(expectedPath);
  });

  it.each([
    ['abc', 'totalAmount'],
    ['Infinity', 'totalAmount'],
    ['0', 'totalAmount'],
    ['-1', 'totalAmount'],
  ])('rejects totalAmount=%s on DEPOSIT', (value, expectedPath) => {
    const result = schema.safeParse({
      ...validBuy,
      type: TransactionType.DEPOSIT,
      ticker: '',
      quantity: '',
      pricePerShare: '',
      totalAmount: value,
    });
    expect(result.success).toBe(false);
    expect(pathsWithIssue(result)).toContain(expectedPath);
  });

  it.each(['abc', 'Infinity', '0', '-1'])(
    'rejects splitRatio=%s on SPLIT',
    (value) => {
      const result = schema.safeParse({
        ...validBuy,
        type: TransactionType.SPLIT,
        quantity: '',
        pricePerShare: '',
        fee: '',
        totalAmount: '0',
        splitRatio: value,
      });
      expect(result.success).toBe(false);
      expect(pathsWithIssue(result)).toContain('splitRatio');
    },
  );

  it('accepts a valid SPLIT', () => {
    const result = schema.safeParse({
      ...validBuy,
      type: TransactionType.SPLIT,
      quantity: '',
      pricePerShare: '',
      fee: '',
      totalAmount: '0',
      splitRatio: '4',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    TransactionType.DEPOSIT,
    TransactionType.WITHDRAW,
    TransactionType.BUY,
    TransactionType.SELL,
    TransactionType.FEE,
    TransactionType.DIVIDEND,
  ])('accepts a valid fxRate on %s', (type) => {
    const result = schema.safeParse({
      ...validBuy,
      type,
      ticker: type === TransactionType.DEPOSIT || type === TransactionType.WITHDRAW || type === TransactionType.FEE ? '' : 'AAPL',
      quantity: type === TransactionType.BUY || type === TransactionType.SELL ? '5' : '',
      pricePerShare: type === TransactionType.BUY || type === TransactionType.SELL ? '100' : '',
      totalAmount: '500',
      fxRate: '1.0871',
    });
    expect(result.success).toBe(true);
  });

  it.each(['abc', 'Infinity', '0', '-1.5'])(
    'rejects fxRate=%s on DEPOSIT',
    (value) => {
      const result = schema.safeParse({
        ...validBuy,
        type: TransactionType.DEPOSIT,
        ticker: '',
        quantity: '',
        pricePerShare: '',
        totalAmount: '500',
        fxRate: value,
      });
      expect(result.success).toBe(false);
      expect(pathsWithIssue(result)).toContain('fxRate');
    },
  );

  it('accepts an empty fxRate (field is optional)', () => {
    const result = schema.safeParse({
      ...validBuy,
      type: TransactionType.DEPOSIT,
      ticker: '',
      quantity: '',
      pricePerShare: '',
      totalAmount: '500',
      fxRate: '',
    });
    expect(result.success).toBe(true);
  });
});

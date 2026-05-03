import { describe, expect, it, vi } from 'vitest';

import {
  buildTransactionData,
  getDefaultValues,
  parseLocalDate,
  roundCurrencyOnBlur,
  toLocalDate,
  toLocalTime,
} from '../components/transaction-form/helpers';
import { TransactionType, type Transaction } from '../api';
import type { FormValues } from '../components/transaction-form/schema';

describe('parseLocalDate', () => {
  it('parses a valid YYYY-MM-DD string into a local-time Date', () => {
    const d = parseLocalDate('2025-06-15');
    expect(d).toBeDefined();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it.each([
    '',
    '2025',
    '2025-06',
    '2025-6-15',
    '25-06-15',
    '2025/06/15',
    'abc',
    '  2025-06-15  ',
  ])('returns undefined for malformed input %s', (input) => {
    expect(parseLocalDate(input)).toBeUndefined();
  });

  it.each([
    ['2025-02-29', 'Feb 29 in non-leap year'],
    ['2025-02-31', 'Feb 31'],
    ['2025-04-31', 'Apr 31'],
    ['2025-13-01', 'month 13'],
    ['2025-00-15', 'month 0'],
    ['2025-06-00', 'day 0'],
    ['2025-06-32', 'day 32'],
  ])('rejects invalid calendar date %s (%s)', (input) => {
    expect(parseLocalDate(input)).toBeUndefined();
  });

  it('accepts Feb 29 in a leap year', () => {
    const d = parseLocalDate('2024-02-29');
    expect(d).toBeDefined();
    expect(d!.getMonth()).toBe(1);
    expect(d!.getDate()).toBe(29);
  });
});

describe('toLocalDate', () => {
  it('formats a Date as YYYY-MM-DD with zero-padded month and day', () => {
    expect(toLocalDate(new Date(2025, 0, 5))).toBe('2025-01-05');
    expect(toLocalDate(new Date(2025, 11, 31))).toBe('2025-12-31');
    expect(toLocalDate(new Date(2025, 8, 9))).toBe('2025-09-09');
  });
});

describe('toLocalTime', () => {
  it('formats a Date as HH:mm:ss with zero-padding', () => {
    expect(toLocalTime(new Date(2025, 0, 1, 9, 5, 7))).toBe('09:05:07');
    expect(toLocalTime(new Date(2025, 0, 1, 23, 59, 59))).toBe('23:59:59');
    expect(toLocalTime(new Date(2025, 0, 1, 0, 0, 0))).toBe('00:00:00');
  });
});

describe('roundCurrencyOnBlur', () => {
  it('rounds a numeric string to two decimals', () => {
    const onChange = vi.fn();
    roundCurrencyOnBlur('12.345', onChange);
    expect(onChange).toHaveBeenCalledWith('12.35');
  });

  it('pads a whole number to two decimals', () => {
    const onChange = vi.fn();
    roundCurrencyOnBlur('5', onChange);
    expect(onChange).toHaveBeenCalledWith('5.00');
  });

  it('does nothing when value is empty', () => {
    const onChange = vi.fn();
    roundCurrencyOnBlur('', onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when value is undefined', () => {
    const onChange = vi.fn();
    roundCurrencyOnBlur(undefined, onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when value is non-numeric', () => {
    const onChange = vi.fn();
    roundCurrencyOnBlur('abc', onChange);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('getDefaultValues', () => {
  it('returns deposit defaults when transaction is undefined', () => {
    const v = getDefaultValues();
    expect(v.type).toBe(TransactionType.DEPOSIT);
    expect(v.ticker).toBe('');
    expect(v.quantity).toBe('');
    expect(v.pricePerShare).toBe('');
    expect(v.fee).toBe('0.00');
    expect(v.totalAmount).toBe('');
    expect(v.valueEur).toBe('');
    expect(v.splitRatio).toBe('');
    expect(v.fxRate).toBe('');
    expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(v.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('hydrates form values from a BUY transaction', () => {
    const tx: Transaction = {
      id: 1,
      portfolio_id: 1,
      date: '2025-06-15T10:30:45',
      type: TransactionType.BUY,
      ticker: 'AAPL',
      quantity: 10,
      price_per_share: 150.5,
      fee: 1.234,
      total_amount: -1506.234,
      eur_amount: null,
      split_ratio: null,
      currency: null,
      fx_rate: null,
    };
    const v = getDefaultValues(tx);
    expect(v.type).toBe(TransactionType.BUY);
    expect(v.ticker).toBe('AAPL');
    expect(v.quantity).toBe('10');
    expect(v.pricePerShare).toBe('150.50');
    expect(v.fee).toBe('1.23');
    expect(v.totalAmount).toBe('1506.23');
  });

  it('hydrates form values from a DEPOSIT transaction with EUR amount', () => {
    const tx: Transaction = {
      id: 1,
      portfolio_id: 1,
      date: '2025-06-15T00:00:00',
      type: TransactionType.DEPOSIT,
      ticker: null,
      quantity: null,
      price_per_share: null,
      fee: null,
      total_amount: 1000,
      eur_amount: 920.55,
      split_ratio: null,
      currency: null,
      fx_rate: null,
    };
    const v = getDefaultValues(tx);
    expect(v.totalAmount).toBe('1000.00');
    expect(v.valueEur).toBe('920.55');
    expect(v.fee).toBe('0.00');
  });

  it('hydrates form values from a SPLIT transaction', () => {
    const tx: Transaction = {
      id: 5,
      portfolio_id: 1,
      date: '2025-06-15T00:00:00',
      type: TransactionType.SPLIT,
      ticker: 'AAPL',
      quantity: null,
      price_per_share: null,
      fee: null,
      total_amount: 0,
      eur_amount: null,
      split_ratio: 4,
      currency: null,
      fx_rate: null,
    };
    const v = getDefaultValues(tx);
    expect(v.splitRatio).toBe('4');
    expect(v.ticker).toBe('AAPL');
  });

  it('hydrates form values from a DIVIDEND transaction with fxRate', () => {
    const tx: Transaction = {
      id: 7,
      portfolio_id: 1,
      date: '2025-06-15T00:00:00',
      type: TransactionType.DIVIDEND,
      ticker: 'MSFT',
      quantity: null,
      price_per_share: null,
      fee: 0.5,
      total_amount: 25,
      eur_amount: null,
      split_ratio: null,
      currency: 'USD',
      fx_rate: 0.9123,
    };
    const v = getDefaultValues(tx);
    expect(v.totalAmount).toBe('25.00');
    expect(v.fxRate).toBe('0.9123');
    expect(v.fee).toBe('0.50');
  });
});

describe('buildTransactionData', () => {
  const baseValues: FormValues = {
    date: '2025-06-15',
    time: '10:30:00',
    type: TransactionType.DEPOSIT,
    ticker: '',
    quantity: '',
    pricePerShare: '',
    fee: '0.00',
    totalAmount: '',
    valueEur: '',
    splitRatio: '',
    fxRate: '',
  };

  it('builds DEPOSIT data with positive total_amount and optional EUR amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.DEPOSIT,
      totalAmount: '1000',
      valueEur: '920.50',
    });
    expect(data.type).toBe(TransactionType.DEPOSIT);
    expect(data.total_amount).toBe(1000);
    expect(data.eur_amount).toBe(920.5);
  });

  it('builds DEPOSIT without EUR amount when valueEur is blank', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.DEPOSIT,
      totalAmount: '1000',
      valueEur: '   ',
    });
    expect(data.eur_amount).toBeUndefined();
  });

  it('builds WITHDRAW data with negative total_amount and EUR amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.WITHDRAW,
      totalAmount: '500',
      valueEur: '460',
    });
    expect(data.total_amount).toBe(-500);
    expect(data.eur_amount).toBe(-460);
  });

  it('builds FEE data with negative total_amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.FEE,
      totalAmount: '12.50',
    });
    expect(data.type).toBe(TransactionType.FEE);
    expect(data.total_amount).toBe(-12.5);
  });

  it('builds BUY data with ticker, quantity, price, fee and negative total_amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.BUY,
      ticker: 'AAPL',
      quantity: '10',
      pricePerShare: '150.5',
      fee: '1.5',
      totalAmount: '1506.5',
    });
    expect(data.ticker).toBe('AAPL');
    expect(data.quantity).toBe(10);
    expect(data.price_per_share).toBe(150.5);
    expect(data.fee).toBe(1.5);
    expect(data.total_amount).toBe(-1506.5);
  });

  it('builds SELL data with positive total_amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.SELL,
      ticker: 'AAPL',
      quantity: '5',
      pricePerShare: '180',
      fee: '1.00',
      totalAmount: '899',
    });
    expect(data.ticker).toBe('AAPL');
    expect(data.quantity).toBe(5);
    expect(data.price_per_share).toBe(180);
    expect(data.fee).toBe(1);
    expect(data.total_amount).toBe(899);
  });

  it.each([
    [TransactionType.DEPOSIT, { totalAmount: '1000', valueEur: '920' }],
    [TransactionType.WITHDRAW, { totalAmount: '500', valueEur: '460' }],
    [TransactionType.FEE, { totalAmount: '12.50' }],
    [
      TransactionType.BUY,
      {
        ticker: 'AAPL',
        quantity: '10',
        pricePerShare: '150',
        fee: '1',
        totalAmount: '1501',
      },
    ],
    [
      TransactionType.SELL,
      {
        ticker: 'AAPL',
        quantity: '5',
        pricePerShare: '180',
        fee: '1',
        totalAmount: '899',
      },
    ],
  ])('sends fx_rate=1.0871 for %s', (type, fields) => {
    const data = buildTransactionData({
      ...baseValues,
      type,
      fxRate: '1.0871',
      ...fields,
    });
    expect(data.fx_rate).toBe(1.0871);
  });

  it.each([
    TransactionType.DEPOSIT,
    TransactionType.WITHDRAW,
    TransactionType.BUY,
    TransactionType.SELL,
    TransactionType.FEE,
  ])('omits fx_rate when blank on %s', (type) => {
    const fields: Partial<FormValues> =
      type === TransactionType.BUY || type === TransactionType.SELL
        ? {
            ticker: 'AAPL',
            quantity: '1',
            pricePerShare: '100',
            fee: '0',
            totalAmount: '100',
          }
        : { totalAmount: '100' };
    const data = buildTransactionData({
      ...baseValues,
      ...fields,
      type,
      fxRate: '   ',
    });
    expect(data.fx_rate).toBeUndefined();
  });

  it('does not send fx_rate for SPLIT (field not shown in UI)', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.SPLIT,
      ticker: 'AAPL',
      splitRatio: '4',
      fxRate: '1.0871',
    });
    expect(data.fx_rate).toBeUndefined();
  });

  it('builds DIVIDEND data with optional fee and fxRate', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.DIVIDEND,
      ticker: 'MSFT',
      totalAmount: '50',
      fee: '0.5',
      fxRate: '0.92',
    });
    expect(data.ticker).toBe('MSFT');
    expect(data.total_amount).toBe(50);
    expect(data.fee).toBe(0.5);
    expect(data.fx_rate).toBe(0.92);
  });

  it('builds DIVIDEND data omitting fee and fxRate when blank', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.DIVIDEND,
      ticker: 'MSFT',
      totalAmount: '50',
      fee: '',
      fxRate: '',
    });
    expect(data.fee).toBeUndefined();
    expect(data.fx_rate).toBeUndefined();
  });

  it('builds SPLIT data with split_ratio and zero total_amount', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.SPLIT,
      ticker: 'AAPL',
      splitRatio: '4',
    });
    expect(data.ticker).toBe('AAPL');
    expect(data.split_ratio).toBe(4);
    expect(data.total_amount).toBe(0);
  });

  it('throws on an unknown transaction type', () => {
    expect(() =>
      buildTransactionData({
        ...baseValues,
        type: 'BOGUS' as unknown as TransactionType,
        totalAmount: '1',
      }),
    ).toThrow(/Unknown transaction type/);
  });

  it('encodes the date as a local-time ISO string', () => {
    const data = buildTransactionData({
      ...baseValues,
      type: TransactionType.DEPOSIT,
      date: '2025-06-15',
      time: '10:30:00',
      totalAmount: '100',
    });
    const back = new Date(data.date);
    expect(back.getFullYear()).toBe(2025);
    expect(back.getMonth()).toBe(5);
    expect(back.getDate()).toBe(15);
    expect(back.getHours()).toBe(10);
    expect(back.getMinutes()).toBe(30);
  });
});

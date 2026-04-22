import { Transaction, TransactionCreate, TransactionType } from '../../api';
import type { FormValues } from './schema';

/** Round a numeric string to 2 decimal places on blur */
export const roundCurrencyOnBlur = (
  value: string | undefined,
  onChange: (v: string) => void,
): void => {
  if (!value) return;
  const n = Number.parseFloat(value);
  if (!Number.isNaN(n)) onChange(n.toFixed(2));
};

/** Returns local date as "YYYY-MM-DD" */
export const toLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Returns local time as "HH:mm:ss" */
export const toLocalTime = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${min}:${sec}`;
};

/** Parses "YYYY-MM-DD" as a local Date without UTC shift.
 *
 * Rejects silently-normalized calendar dates: ``new Date(2025, 1, 31)``
 * rolls over to March 3, so we verify the constructed Date's parts
 * round-trip to the input values. Invalid calendar inputs like
 * "2025-02-31", "2025-13-01", "2025-00-15" return undefined instead of
 * resolving to a different valid day. */
export const parseLocalDate = (str: string): Date | undefined => {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return undefined;
  }
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return undefined;
  }
  return date;
};

export const getDefaultValues = (transaction?: Transaction): FormValues => {
  const now = new Date();
  if (!transaction) {
    return {
      date: toLocalDate(now),
      time: toLocalTime(now),
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
  }
  const d = new Date(transaction.date);
  return {
    date: toLocalDate(d),
    time: toLocalTime(d),
    type: transaction.type,
    ticker: transaction.ticker || '',
    quantity: transaction.quantity?.toString() || '',
    pricePerShare: transaction.price_per_share
      ? transaction.price_per_share.toFixed(2)
      : '',
    fee: transaction.fee ? transaction.fee.toFixed(2) : '0.00',
    totalAmount: Math.abs(transaction.total_amount).toFixed(2),
    valueEur: transaction.eur_amount
      ? Math.abs(transaction.eur_amount).toFixed(2)
      : '',
    splitRatio: transaction.split_ratio?.toString() || '',
    fxRate: transaction.fx_rate ? transaction.fx_rate.toFixed(4) : '',
  };
};

export const buildTransactionData = (values: FormValues): TransactionCreate => {
  const base: TransactionCreate = {
    date: new Date(`${values.date}T${values.time}`).toISOString(),
    type: values.type,
    total_amount: 0,
  };

  switch (values.type) {
    case TransactionType.DEPOSIT:
      base.total_amount = Math.abs(Number.parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim())
        base.eur_amount = Math.abs(Number.parseFloat(values.valueEur));
      break;
    case TransactionType.WITHDRAW:
      base.total_amount = -Math.abs(Number.parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim())
        base.eur_amount = -Math.abs(Number.parseFloat(values.valueEur));
      break;
    case TransactionType.FEE:
      base.total_amount = -Math.abs(Number.parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.BUY:
      base.ticker = values.ticker;
      base.quantity = Number.parseFloat(values.quantity || '0');
      base.price_per_share = Number.parseFloat(values.pricePerShare || '0');
      base.fee = Math.abs(Number.parseFloat(values.fee || '0'));
      base.total_amount = -Math.abs(Number.parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.SELL:
      base.ticker = values.ticker;
      base.quantity = Number.parseFloat(values.quantity || '0');
      base.price_per_share = Number.parseFloat(values.pricePerShare || '0');
      base.fee = Math.abs(Number.parseFloat(values.fee || '0'));
      base.total_amount = Math.abs(Number.parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.DIVIDEND:
      base.ticker = values.ticker;
      base.total_amount = Math.abs(Number.parseFloat(values.totalAmount || '0'));
      if (values.fee?.trim()) base.fee = Math.abs(Number.parseFloat(values.fee));
      if (values.fxRate?.trim()) base.fx_rate = Number.parseFloat(values.fxRate);
      break;
    case TransactionType.SPLIT:
      base.ticker = values.ticker;
      base.split_ratio = Number.parseFloat(values.splitRatio || '1');
      base.total_amount = 0;
      break;
    default:
      throw new Error(`Unknown transaction type: ${values.type}`);
  }

  return base;
};

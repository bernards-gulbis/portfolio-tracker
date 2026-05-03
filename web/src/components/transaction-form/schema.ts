import * as z from 'zod';

import { TransactionType } from '../../api';
import i18n from '../../i18n/index';

/** Display order for the transaction type select and the table filter. */
export const TRANSACTION_TYPE_ORDER: TransactionType[] = [
  TransactionType.DEPOSIT,
  TransactionType.WITHDRAW,
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DIVIDEND,
  TransactionType.FEE,
  TransactionType.SPLIT,
];

export const TICKER_TYPES = new Set<TransactionType>([
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DIVIDEND,
  TransactionType.SPLIT,
]);

export const BUY_SELL_TYPES = new Set<TransactionType>([
  TransactionType.BUY,
  TransactionType.SELL,
]);

export const FEE_TYPES = new Set<TransactionType>([
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.DIVIDEND,
]);

export const EUR_TYPES = new Set<TransactionType>([
  TransactionType.DEPOSIT,
  TransactionType.WITHDRAW,
]);

export const FX_RATE_TYPES = new Set<TransactionType>([
  TransactionType.DEPOSIT,
  TransactionType.WITHDRAW,
  TransactionType.BUY,
  TransactionType.SELL,
  TransactionType.FEE,
  TransactionType.DIVIDEND,
]);

/** Return the parsed value when it is a strictly positive finite number,
 *  null otherwise. Rejects NaN ("abc"), ±Infinity, empty/undefined, zero,
 *  and negative inputs — the bare ``parseFloat(x) <= 0`` check would let
 *  NaN and +Infinity slip through because both comparisons with <= 0 are
 *  false, silently admitting garbage into ``buildTransactionData``. */
const parsePositive = (value: string | undefined): number | null => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const schema = z
  .object({
    date: z.string().superRefine((val, ctx) => {
      if (val.length < 1)
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('transaction.validation.dateRequired'),
        });
    }),
    time: z.string().superRefine((val, ctx) => {
      if (val.length < 1)
        ctx.addIssue({
          code: 'custom',
          message: i18n.t('transaction.validation.timeRequired'),
        });
    }),
    type: z.enum(TransactionType),
    ticker: z.string().optional(),
    quantity: z.string().optional(),
    pricePerShare: z.string().optional(),
    fee: z.string().optional(),
    totalAmount: z.string().optional(),
    valueEur: z.string().optional(),
    splitRatio: z.string().optional(),
    fxRate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { type } = data;

    if (TICKER_TYPES.has(type)) {
      if (!data.ticker?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['ticker'],
          message: i18n.t('transaction.validation.tickerRequired'),
        });
      }
    }

    if (BUY_SELL_TYPES.has(type)) {
      if (parsePositive(data.quantity) == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: i18n.t('transaction.validation.quantityPositive'),
        });
      }
      if (parsePositive(data.pricePerShare) == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['pricePerShare'],
          message: i18n.t('transaction.validation.pricePositive'),
        });
      }
    }

    if (type === TransactionType.SPLIT) {
      if (parsePositive(data.splitRatio) == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['splitRatio'],
          message: i18n.t('transaction.validation.splitRatioPositive'),
        });
      }
    }

    if (type !== TransactionType.SPLIT) {
      if (parsePositive(data.totalAmount) == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['totalAmount'],
          message: i18n.t('transaction.validation.totalAmountPositive'),
        });
      }
    }

    if (FX_RATE_TYPES.has(type) && data.fxRate?.trim()) {
      if (parsePositive(data.fxRate) == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['fxRate'],
          message: i18n.t('transaction.validation.fxRatePositive'),
        });
      }
    }
  });

export type FormValues = z.infer<typeof schema>;

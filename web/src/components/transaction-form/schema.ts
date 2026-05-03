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

/** Return the parsed value when it is a strictly positive finite number,
 *  null otherwise. Rejects NaN ("abc"), ±Infinity, empty/undefined, zero,
 *  and negative inputs — the bare ``parseFloat(x) <= 0`` check would let
 *  NaN and +Infinity slip through because both comparisons with <= 0 are
 *  false, silently admitting garbage into ``buildTransactionData``. */
const parsePositive = (value: string | undefined): number | null => {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) && n > 0 ? n : null;
};

const requirePositive = (
  ctx: z.RefinementCtx,
  path: 'quantity' | 'pricePerShare' | 'splitRatio' | 'totalAmount' | 'fxRate',
  value: string | undefined,
  message: string,
) => {
  if (parsePositive(value) == null) {
    ctx.addIssue({ code: 'custom', path: [path], message });
  }
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

    if (TICKER_TYPES.has(type) && !data.ticker?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['ticker'],
        message: i18n.t('transaction.validation.tickerRequired'),
      });
    }

    if (BUY_SELL_TYPES.has(type)) {
      requirePositive(ctx, 'quantity', data.quantity, i18n.t('transaction.validation.quantityPositive'));
      requirePositive(ctx, 'pricePerShare', data.pricePerShare, i18n.t('transaction.validation.pricePositive'));
    }

    if (type === TransactionType.SPLIT) {
      requirePositive(ctx, 'splitRatio', data.splitRatio, i18n.t('transaction.validation.splitRatioPositive'));
    }

    if (type !== TransactionType.SPLIT) {
      requirePositive(ctx, 'totalAmount', data.totalAmount, i18n.t('transaction.validation.totalAmountPositive'));
    }

    if (data.fxRate?.trim()) {
      requirePositive(ctx, 'fxRate', data.fxRate, i18n.t('transaction.validation.fxRatePositive'));
    }
  });

export type FormValues = z.infer<typeof schema>;

import * as z from 'zod';

import { TransactionType } from '../../api';
import i18n from '../../i18n/index';

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
      if (Number.parseFloat(data.quantity || '0') <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: i18n.t('transaction.validation.quantityPositive'),
        });
      }
      if (Number.parseFloat(data.pricePerShare || '0') <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['pricePerShare'],
          message: i18n.t('transaction.validation.pricePositive'),
        });
      }
    }

    if (type === TransactionType.SPLIT) {
      if (Number.parseFloat(data.splitRatio || '0') <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['splitRatio'],
          message: i18n.t('transaction.validation.splitRatioPositive'),
        });
      }
    }

    if (type !== TransactionType.SPLIT) {
      if (Number.parseFloat(data.totalAmount || '0') <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['totalAmount'],
          message: i18n.t('transaction.validation.totalAmountPositive'),
        });
      }
    }
  });

export type FormValues = z.infer<typeof schema>;

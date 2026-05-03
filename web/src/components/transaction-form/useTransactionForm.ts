import { useEffect, useMemo, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';

import {
  Holding,
  Transaction,
  TransactionType,
  getErrorMessage,
} from '../../api';
import { useFxRate } from '../../hooks/useFxRate';
import { useLivePrices } from '../../hooks/useLivePrices';
import { usePortfolioStatus } from '../../hooks/usePortfolioStatus';
import {
  useCreateTransaction,
  useUpdateTransaction,
} from '../../hooks/useTransactions';
import {
  BUY_SELL_TYPES,
  EUR_TYPES,
  FEE_TYPES,
  FX_RATE_TYPES,
  TICKER_TYPES,
  schema,
  type FormValues,
} from './schema';
import { buildTransactionData, getDefaultValues } from './helpers';

interface UseTransactionFormOptions {
  isOpen: boolean;
  portfolioId: number;
  transaction?: Transaction;
  onClose: () => void;
}

export interface UseTransactionFormResult {
  form: UseFormReturn<FormValues>;
  holdings: Holding[];
  selectedHolding: Holding | undefined;

  isEdit: boolean;
  isSell: boolean;
  isPending: boolean;

  showTicker: boolean;
  showTickerCombobox: boolean;
  showQuantity: boolean;
  showPricePerShare: boolean;
  showFee: boolean;
  showTotalAmount: boolean;
  showValueEur: boolean;
  showSplitRatio: boolean;
  showFxRate: boolean;

  /** Current USD→EUR rate (EUR per USD) used for the inline rate hint and
   *  auto-fill effects. ``null`` while loading or if the live fetch failed. */
  eurRate: number | null;

  onSubmit: (values: FormValues) => Promise<void>;
  handleClose: () => void;
  /** Apply ticker-change side effects (auto-fill or clear price) after
   *  ``field.onChange`` has already updated the form value. */
  applyTickerSideEffects: (value: string) => void;
  /** Mark the price-per-share field as user-edited (call from its onChange). */
  markPriceAsUserEdited: () => void;
  /** Mark the totalAmount field as user-edited so the BUY/SELL auto-calc
   *  (qty × price ± fee) stops overwriting it. */
  markTotalAsUserEdited: () => void;
  /** Mark the valueEur field as user-edited so the DEPOSIT/WITHDRAW
   *  auto-derive (total × usd_to_eur_rate) stops overwriting it. */
  markValueEurAsUserEdited: () => void;
}

/**
 * Encapsulates everything the transaction modal needs apart from JSX:
 * react-hook-form setup, auto-fill effects, submit dispatch, and the two
 * ref-based provenance trackers that govern when an auto-filled sell price
 * is allowed to persist across ticker changes.
 *
 * The ref/effect ordering here matters. Do not reorder without a failing
 * test: the behavior under "select ticker → type custom price → switch to
 * another ticker → switch back" is subtle.
 */
export function useTransactionForm({
  isOpen,
  portfolioId,
  transaction,
  onClose,
}: UseTransactionFormOptions): UseTransactionFormResult {
  const isEdit = !!transaction;
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const { data: portfolioStatus } = usePortfolioStatus(portfolioId);
  const holdings = useMemo<Holding[]>(
    () => portfolioStatus?.holdings ?? [],
    [portfolioStatus?.holdings],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(transaction),
  });

  const { reset, setValue, watch, setError } = form;
  // eslint-disable-next-line react-hooks/incompatible-library
  const type = watch('type');
  const watchedTicker = watch('ticker');
  const watchedQuantity = watch('quantity');
  const watchedPrice = watch('pricePerShare');
  const watchedFee = watch('fee');
  const watchedTotal = watch('totalAmount');

  const isSell = type === TransactionType.SELL;
  const isDividend = type === TransactionType.DIVIDEND;

  const showTickerCombobox = isSell || isDividend;
  const showTicker = TICKER_TYPES.has(type);
  const showQuantity = BUY_SELL_TYPES.has(type);
  const showPricePerShare = BUY_SELL_TYPES.has(type);
  const showFee = FEE_TYPES.has(type);
  const showTotalAmount = type !== TransactionType.SPLIT;
  const showValueEur = EUR_TYPES.has(type);
  const showSplitRatio = type === TransactionType.SPLIT;
  const showFxRate = FX_RATE_TYPES.has(type);

  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const { data: livePrices } = useLivePrices(
    tickers,
    tickers.length > 0 && isOpen && isSell,
  );
  const selectedHolding = isSell
    ? holdings.find((h) => h.ticker === watchedTicker)
    : undefined;

  // Reset form when the modal is (re-)opened or the edit target changes.
  useEffect(() => {
    if (isOpen) reset(getDefaultValues(transaction));
  }, [isOpen, transaction, reset]);

  // When the user switches transaction type, clear fields the new type doesn't
  // display so stale data from the previous type can't leak into submission.
  // Skipped on initial open (the reset effect above already loaded defaults).
  const prevTypeRef = useRef<TransactionType | null>(null);
  useEffect(() => {
    if (!isOpen) {
      prevTypeRef.current = null;
      return;
    }
    const prevType = prevTypeRef.current;
    prevTypeRef.current = type;
    const typeChanged = prevType !== null && prevType !== type;
    if (!typeChanged) return;

    if (!TICKER_TYPES.has(type)) setValue('ticker', '');
    if (!BUY_SELL_TYPES.has(type)) {
      setValue('quantity', '');
      setValue('pricePerShare', '');
    }
    if (!FEE_TYPES.has(type)) setValue('fee', '0.00');
    if (!EUR_TYPES.has(type)) setValue('valueEur', '');
    if (type !== TransactionType.SPLIT) setValue('splitRatio', '');
  }, [isOpen, type, setValue]);

  // Once the user types into totalAmount or valueEur, the corresponding auto-calc
  // backs off so subsequent dependency changes don't silently overwrite the
  // user's value. In edit mode, saved values count as user-authored from the
  // moment the modal opens — the bank-statement EUR (saved as eur_amount) and
  // the original total are both intentional records that the auto-derive must
  // not overwrite on initial mount. Flags reset on reopen and on type change.
  const totalAmountUserEdited = useRef(false);
  const valueEurUserEdited = useRef(false);
  useEffect(() => {
    totalAmountUserEdited.current = isEdit;
    valueEurUserEdited.current = isEdit && transaction?.eur_amount != null;
  }, [isOpen, type, isEdit, transaction]);

  // Auto-calculate totalAmount for BUY/SELL from quantity × price ± fee.
  useEffect(() => {
    if (!BUY_SELL_TYPES.has(type)) return;
    if (totalAmountUserEdited.current) return;
    const qty = Number.parseFloat(watchedQuantity || '0');
    const price = Number.parseFloat(watchedPrice || '0');
    const fee = Math.abs(Number.parseFloat(watchedFee || '0'));
    if (qty > 0 && price > 0) {
      const total = isSell ? qty * price - fee : qty * price + fee;
      setValue('totalAmount', total.toFixed(2));
    }
  }, [watchedQuantity, watchedPrice, watchedFee, type, isSell, setValue]);

  // Provenance trackers for pricePerShare (sell flow):
  //   priceWasAutoFilled: did WE fill this via livePrices, or did the user?
  //   priceOwnerTicker:   which ticker is this price tied to?
  // On ticker change we clear the price iff it was auto-filled OR belongs to
  // a different ticker — user-typed values for the *same* ticker survive.
  const priceWasAutoFilled = useRef(false);
  const priceOwnerTicker = useRef<string | null>(
    isEdit ? transaction?.ticker ?? null : null,
  );

  // Auto-fill sell price when livePrices arrives after ticker was selected.
  useEffect(() => {
    if (!isSell || !watchedTicker || !livePrices) return;
    const livePrice = livePrices.prices[watchedTicker]?.price ?? null;
    if (livePrice != null && !form.getValues('pricePerShare')) {
      setValue('pricePerShare', livePrice.toFixed(2));
      priceWasAutoFilled.current = true;
      priceOwnerTicker.current = watchedTicker;
    }
  }, [isSell, watchedTicker, livePrices, form, setValue]);

  // Date-aware USD→EUR rate. The hook returns the historical rate when
  // ``watchedDate`` is in the past, or the live rate for today/future. Falling
  // back to ``portfolioStatus.usd_to_eur_rate`` keeps a sensible default while
  // the per-date query is loading or if the lookup 404s for an out-of-range date.
  const watchedDate = watch('date');
  const { data: dateRate } = useFxRate(watchedDate);
  const eurRate = dateRate?.usd_to_eur_rate ?? portfolioStatus?.usd_to_eur_rate;

  // Auto-fill FX rate when empty. With date-aware ``eurRate``, this is correct
  // for both new and edit cases — saved fx_rate already populates the field via
  // getDefaultValues, so the auto-fill only kicks in when there's no saved rate.
  //
  // Unit conversion: Transaction.fx_rate is stored as USD per EUR (backend
  // computes EUR via total_usd / fx_rate), while usd_to_eur_rate is EUR per USD
  // (~0.92), so we invert at the boundary. Forwarding the raw rate would inflate
  // the saved EUR equivalent by ~17%.
  //
  // ``isOpen`` and ``transaction`` are deps so the effect re-fires after each
  // ``reset()`` on reopen — the modal stays mounted across opens (see
  // TransactionView).
  useEffect(() => {
    if (!isOpen || !showFxRate) return;
    if (form.getValues('fxRate')) return;
    if (eurRate == null || eurRate <= 0) return;
    setValue('fxRate', (1 / eurRate).toFixed(4));
  }, [isOpen, transaction, showFxRate, eurRate, form, setValue]);

  // Auto-calculate EUR amount for DEPOSIT/WITHDRAW when totalAmount changes.
  useEffect(() => {
    if (!showValueEur || eurRate == null) return;
    if (valueEurUserEdited.current) return;
    const total = Number.parseFloat(watchedTotal || '0');
    if (total > 0) {
      setValue('valueEur', (total * eurRate).toFixed(2));
    } else {
      setValue('valueEur', '');
    }
  }, [watchedTotal, eurRate, showValueEur, setValue]);

  const applyTickerSideEffects = (value: string) => {
    if (!isSell) return;
    const livePrice = livePrices?.prices[value]?.price ?? null;
    if (livePrice != null) {
      setValue('pricePerShare', livePrice.toFixed(2));
      priceWasAutoFilled.current = true;
      priceOwnerTicker.current = value;
      return;
    }
    const belongsToOtherTicker =
      priceOwnerTicker.current !== null && priceOwnerTicker.current !== value;
    if (priceWasAutoFilled.current || belongsToOtherTicker) {
      setValue('pricePerShare', '');
      priceWasAutoFilled.current = false;
    }
    priceOwnerTicker.current = value;
  };

  const markPriceAsUserEdited = () => {
    priceWasAutoFilled.current = false;
    priceOwnerTicker.current = watchedTicker || null;
  };

  const markTotalAsUserEdited = () => {
    totalAmountUserEdited.current = true;
  };

  const markValueEurAsUserEdited = () => {
    valueEurUserEdited.current = true;
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const data = buildTransactionData(values);
      if (isEdit && transaction) {
        await updateTransaction.mutateAsync({
          transactionId: transaction.id,
          data,
          portfolioId,
        });
      } else {
        await createTransaction.mutateAsync({ portfolioId, data });
      }
      onClose();
    } catch (err) {
      setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  return {
    form,
    holdings,
    selectedHolding,

    isEdit,
    isSell,
    isPending,

    showTicker,
    showTickerCombobox,
    showQuantity,
    showPricePerShare,
    showFee,
    showTotalAmount,
    showValueEur,
    showSplitRatio,
    showFxRate,

    eurRate: eurRate ?? null,

    onSubmit,
    handleClose,
    applyTickerSideEffects,
    markPriceAsUserEdited,
    markTotalAsUserEdited,
    markValueEurAsUserEdited,
  };
}

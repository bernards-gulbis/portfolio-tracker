import { useEffect, useMemo, useRef } from 'react';
import { useLocale } from '../hooks/useLocale';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { useLivePrices } from '../hooks/useLivePrices';
import { Transaction, TransactionType, Holding, getErrorMessage } from '../api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { DatePickerField } from './transaction-form/DatePickerField';
import { TickerCombobox } from './transaction-form/TickerCombobox';
import {
  BUY_SELL_TYPES,
  EUR_TYPES,
  FEE_TYPES,
  TICKER_TYPES,
  schema,
  type FormValues,
} from './transaction-form/schema';
import {
  buildTransactionData,
  getDefaultValues,
  roundCurrencyOnBlur,
} from './transaction-form/helpers';

// ─── Component ─────────────────────────────────────────────────────────────

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  transaction?: Transaction;
}

export const TransactionModal = ({
  isOpen,
  onClose,
  portfolioId,
  transaction,
}: TransactionModalProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const isEdit = !!transaction;
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const { data: portfolioStatus } = usePortfolioStatus(portfolioId);
  const holdings = useMemo<Holding[]>(() => portfolioStatus?.holdings ?? [], [portfolioStatus?.holdings]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(transaction),
  });

  const { reset, clearErrors } = form;
  // eslint-disable-next-line react-hooks/incompatible-library
  const type = form.watch('type');
  const watchedTicker = form.watch('ticker');
  const watchedQuantity = form.watch('quantity');
  const watchedPrice = form.watch('pricePerShare');
  const watchedFee = form.watch('fee');
  const watchedTotal = form.watch('totalAmount');

  const isSell = type === TransactionType.SELL;
  const isDividend = type === TransactionType.DIVIDEND;

  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const { data: livePrices } = useLivePrices(tickers, tickers.length > 0 && isOpen && isSell);
  const showTickerCombobox = isSell || isDividend;
  const selectedHolding = isSell ? holdings.find(h => h.ticker === watchedTicker) : undefined;

  useEffect(() => {
    if (isOpen) reset(getDefaultValues(transaction));
  }, [isOpen, transaction, reset]);

  // Auto-calculate totalAmount for BUY/SELL
  useEffect(() => {
    if (!BUY_SELL_TYPES.has(type)) return;
    const qty = Number.parseFloat(watchedQuantity || '0');
    const price = Number.parseFloat(watchedPrice || '0');
    const fee = Math.abs(Number.parseFloat(watchedFee || '0'));
    if (qty > 0 && price > 0) {
      const total = isSell ? qty * price - fee : qty * price + fee;
      form.setValue('totalAmount', total.toFixed(2));
    }
  }, [watchedQuantity, watchedPrice, watchedFee, type, isSell, form]);

  // Track the provenance of pricePerShare so we can decide what to do on
  // ticker change:
  //   - priceWasAutoFilled: did WE fill this (via livePrices), or did the user?
  //   - priceOwnerTicker: which ticker was this price entered/filled for?
  // On ticker change, we clear the price iff it was auto-filled OR belongs to
  // a different ticker (so user-typed values for the *same* ticker survive).
  const priceWasAutoFilled = useRef(false);
  const priceOwnerTicker = useRef<string | null>(
    isEdit ? transaction?.ticker ?? null : null,
  );

  // Auto-fill sell price when livePrices arrives after ticker was already selected
  useEffect(() => {
    if (!isSell || !watchedTicker || !livePrices) return;
    const livePrice = livePrices.prices[watchedTicker]?.price ?? null;
    if (livePrice != null && !form.getValues('pricePerShare')) {
      form.setValue('pricePerShare', livePrice.toFixed(2));
      priceWasAutoFilled.current = true;
      priceOwnerTicker.current = watchedTicker;
    }
  }, [isSell, watchedTicker, livePrices, form]);

  // Auto-fill FX rate for DIVIDEND when empty
  const eurRate = portfolioStatus?.usd_to_eur_rate;
  useEffect(() => {
    if (isDividend && !form.getValues('fxRate') && eurRate != null) {
      form.setValue('fxRate', eurRate.toFixed(4));
    }
  }, [isDividend, eurRate, form]);

  // Auto-calculate EUR amount for DEPOSIT/WITHDRAW when totalAmount changes
  const showValueEur = EUR_TYPES.has(type);
  useEffect(() => {
    if (!showValueEur || eurRate == null) return;
    const total = Number.parseFloat(watchedTotal || '0');
    if (total > 0) {
      form.setValue('valueEur', (total * eurRate).toFixed(2));
    } else {
      form.setValue('valueEur', '');
    }
  }, [watchedTotal, eurRate, showValueEur, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      const data = buildTransactionData(values);
      if (isEdit && transaction) {
        await updateTransaction.mutateAsync({ transactionId: transaction.id, data, portfolioId });
      } else {
        await createTransaction.mutateAsync({ portfolioId, data });
      }
      onClose();
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  const showTicker = TICKER_TYPES.has(type);
  const showQuantity = BUY_SELL_TYPES.has(type);
  const showPricePerShare = BUY_SELL_TYPES.has(type);
  const showFee = FEE_TYPES.has(type);
  const showTotalAmount = type !== TransactionType.SPLIT;
  const showSplitRatio = type === TransactionType.SPLIT;
  const showFxRate = type === TransactionType.DIVIDEND;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('transaction.modal.editTitle') : t('transaction.modal.addTitle')}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? t('transaction.modal.editDescription') : t('transaction.modal.addDescription')}
          </DialogDescription>
        </DialogHeader>

        <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              {/* Date */}
              <Controller
                name="date"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-date">{t('transaction.modal.fields.date')}</FieldLabel>
                    <DatePickerField
                      value={field.value}
                      onChange={field.onChange}
                      invalid={fieldState.invalid}
                      locale={locale}
                      id="tx-date"
                      pickerAriaLabel={t('transaction.modal.fields.datePickerLabel')}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              {/* Time — native time input */}
              <Controller
                name="time"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-time">{t('transaction.modal.fields.time')}</FieldLabel>
                    <Input
                      {...field}
                      id="tx-time"
                      type="time"
                      step="1"
                      className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>

            {/* Transaction Type */}
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="tx-type">{t('transaction.modal.fields.type')}</FieldLabel>
                  <Select
                    name="tx-type"
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      clearErrors();
                    }}
                  >
                    <SelectTrigger id="tx-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TransactionType.DEPOSIT}>{t('transaction.modal.types.Deposit')}</SelectItem>
                      <SelectItem value={TransactionType.WITHDRAW}>{t('transaction.modal.types.Withdraw')}</SelectItem>
                      <SelectItem value={TransactionType.BUY}>{t('transaction.modal.types.Buy')}</SelectItem>
                      <SelectItem value={TransactionType.SELL}>{t('transaction.modal.types.Sell')}</SelectItem>
                      <SelectItem value={TransactionType.DIVIDEND}>{t('transaction.modal.types.Dividend')}</SelectItem>
                      <SelectItem value={TransactionType.FEE}>{t('transaction.modal.types.Fee')}</SelectItem>
                      <SelectItem value={TransactionType.SPLIT}>{t('transaction.modal.types.Split')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            {/* Ticker */}
            {showTicker && (
              <Controller
                name="ticker"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-ticker">{t('transaction.modal.fields.ticker')}</FieldLabel>
                    {showTickerCombobox ? (
                      <TickerCombobox
                        value={field.value ?? ''}
                        holdings={holdings}
                        editTicker={isEdit ? transaction?.ticker ?? undefined : undefined}
                        invalid={fieldState.invalid}
                        placeholder={t('transaction.modal.fields.sellTickerPlaceholder')}
                        noHoldingsText={t('transaction.modal.fields.noHoldings')}
                        onChange={(value) => {
                          field.onChange(value);
                          if (isSell) {
                            const livePrice =
                              livePrices?.prices[value]?.price ?? null;
                            if (livePrice == null) {
                              // Clear iff the existing price belongs to us
                              // (auto-fill) or to a different ticker. A
                              // user-typed value for the SAME ticker survives.
                              const belongsToOtherTicker =
                                priceOwnerTicker.current !== null &&
                                priceOwnerTicker.current !== value;
                              if (
                                priceWasAutoFilled.current ||
                                belongsToOtherTicker
                              ) {
                                form.setValue('pricePerShare', '');
                                priceWasAutoFilled.current = false;
                              }
                              priceOwnerTicker.current = value;
                            } else {
                              form.setValue('pricePerShare', livePrice.toFixed(2));
                              priceWasAutoFilled.current = true;
                              priceOwnerTicker.current = value;
                            }
                          }
                        }}
                      />
                    ) : (
                      <Input
                        {...field}
                        id="tx-ticker"
                        placeholder={t('transaction.modal.fields.tickerPlaceholder')}
                        autoComplete="off"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Quantity */}
            {showQuantity && (
              <Controller
                name="quantity"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-quantity">{t('transaction.modal.fields.quantity')}</FieldLabel>
                    {isSell && selectedHolding ? (
                      <div className="flex gap-2">
                        <Input
                          {...field}
                          id="tx-quantity"
                          type="number"
                          step="0.00000001"
                          min="0.00000001"
                          placeholder={t('transaction.modal.fields.quantityPlaceholder')}
                          autoComplete="off"
                          aria-invalid={fieldState.invalid}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 self-center"
                          onClick={() => form.setValue('quantity', String(selectedHolding.quantity))}
                        >
                          {t('transaction.modal.fields.sellAll')}
                        </Button>
                      </div>
                    ) : (
                      <Input
                        {...field}
                        id="tx-quantity"
                        type="number"
                        step="0.00000001"
                        min="0.00000001"
                        placeholder={t('transaction.modal.fields.quantityPlaceholder')}
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                    {isSell && selectedHolding && (
                      <FieldDescription>
                        {t('transaction.modal.fields.availableQuantity', { quantity: selectedHolding.quantity })}
                      </FieldDescription>
                    )}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Price per Share */}
            {showPricePerShare && (
              <Controller
                name="pricePerShare"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-price">{t('transaction.modal.fields.pricePerShare')}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="tx-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        onChange={(e) => {
                          field.onChange(e);
                          priceWasAutoFilled.current = false;
                          // User-typed value belongs to the currently selected ticker.
                          priceOwnerTicker.current = watchedTicker || null;
                        }}
                        onBlur={() => roundCurrencyOnBlur(field.value, field.onChange)}
                      />
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Fee */}
            {showFee && (
              <Controller
                name="fee"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-fee">{t('transaction.modal.fields.fee')}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="tx-fee"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        onBlur={() => roundCurrencyOnBlur(field.value, field.onChange)}
                      />
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Total Amount */}
            {showTotalAmount && (
              <Controller
                name="totalAmount"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-total">{t('transaction.modal.fields.totalAmount')}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="tx-total"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        onBlur={() => roundCurrencyOnBlur(field.value, field.onChange)}
                      />
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Amount in EUR */}
            {showValueEur && (
              <Controller
                name="valueEur"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-eur">{t('transaction.modal.fields.amountInEur')}</FieldLabel>
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText>€</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        {...field}
                        id="tx-eur"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        onBlur={() => roundCurrencyOnBlur(field.value, field.onChange)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>EUR</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* Split Ratio */}
            {showSplitRatio && (
              <Controller
                name="splitRatio"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-split">{t('transaction.modal.fields.splitRatio')}</FieldLabel>
                    <Input
                      {...field}
                      id="tx-split"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder={t('transaction.modal.fields.splitRatioPlaceholder')}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      {t('transaction.modal.fields.splitRatioDescription')}
                    </FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {/* FX Rate */}
            {showFxRate && (
              <Controller
                name="fxRate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-fx">{t('transaction.modal.fields.fxRate')}</FieldLabel>
                    <Input
                      {...field}
                      id="tx-fx"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      placeholder={t('transaction.modal.fields.fxRatePlaceholder')}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{t('transaction.modal.fields.fxRateDescription')}</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="transaction-form" disabled={isPending}>
            {isPending && <Spinner />}
            {isEdit ? t('transaction.modal.update') : t('transaction.modal.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


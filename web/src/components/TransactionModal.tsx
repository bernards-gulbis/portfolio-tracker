import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../hooks/useLocale';
import i18n from '../i18n/index';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { Transaction, TransactionType, TransactionCreate, Holding, getErrorMessage } from '../api';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { CalendarIcon } from 'lucide-react';
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
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

// ─── Schema ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    date: z.string().superRefine((val, ctx) => {
      if (val.length < 1) ctx.addIssue({ code: "custom", message: i18n.t('transaction.validation.dateRequired') });
    }),
    time: z.string().superRefine((val, ctx) => {
      if (val.length < 1) ctx.addIssue({ code: "custom", message: i18n.t('transaction.validation.timeRequired') });
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

    if (
      [
        TransactionType.BUY,
        TransactionType.SELL,
        TransactionType.DIVIDEND,
        TransactionType.SPLIT,
      ].includes(type)
    ) {
      if (!data.ticker?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ['ticker'],
          message: i18n.t('transaction.validation.tickerRequired'),
        });
      }
    }

    if ([TransactionType.BUY, TransactionType.SELL].includes(type)) {
      if (Number.parseFloat(data.quantity || '0') <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ['quantity'],
          message: i18n.t('transaction.validation.quantityPositive'),
        });
      }
      if (Number.parseFloat(data.pricePerShare || '0') <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ['pricePerShare'],
          message: i18n.t('transaction.validation.pricePositive'),
        });
      }
    }

    if (type === TransactionType.SPLIT) {
      if (Number.parseFloat(data.splitRatio || '0') <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ['splitRatio'],
          message: i18n.t('transaction.validation.splitRatioPositive'),
        });
      }
    }

    if (type !== TransactionType.SPLIT) {
      if (Number.parseFloat(data.totalAmount || '0') <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ['totalAmount'],
          message: i18n.t('transaction.validation.totalAmountPositive'),
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Returns local date as "YYYY-MM-DD" */
const toLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Returns local time as "HH:mm:ss" */
const toLocalTime = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${min}:${sec}`;
};

/** Parses "YYYY-MM-DD" as a local Date without UTC shift */
const parseLocalDate = (str: string): Date | undefined => {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface DatePickerFieldProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  invalid?: boolean;
  locale: string;
  id: string;
  pickerAriaLabel: string;
}

const DatePickerField = ({ value, onChange, invalid, locale, id, pickerAriaLabel }: DatePickerFieldProps) => {
  const [open, setOpen] = useState(false);
  // displayValue mirrors the form value in YYYY-MM-DD format so the input
  // can be parsed back reliably regardless of the active locale.
  const [displayValue, setDisplayValue] = useState(value ?? '');
  const [month, setMonth] = useState<Date | undefined>(parseLocalDate(value));

  // Tracks changes we triggered ourselves so we don't overwrite mid-typing
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    // External change (form reset) — re-sync display
    setDisplayValue(value ?? '');
    const date = parseLocalDate(value);
    if (date) setMonth(date);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value;
    setDisplayValue(typed);
    const parsed = parseLocalDate(typed);
    if (parsed) {
      skipNextSyncRef.current = true;
      onChange(toLocalDate(parsed));
      setMonth(parsed);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const ymd = toLocalDate(date);
      skipNextSyncRef.current = true;
      onChange(ymd);
      setDisplayValue(ymd);
      setMonth(date);
    }
    setOpen(false);
  };

  const placeholder = 'YYYY-MM-DD';

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        value={displayValue}
        placeholder={placeholder}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-invalid={invalid}
        autoComplete="off"
        className="rounded-l-md"
      />
      <InputGroupAddon align="inline-end" className="bg-background p-0">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton aria-label={pickerAriaLabel}>
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
            <Calendar
              mode="single"
              selected={parseLocalDate(value)}
              month={month}
              onMonthChange={setMonth}
              onSelect={handleCalendarSelect}
              formatters={{
                formatCaption: (date) =>
                  date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
                formatMonthDropdown: (date) =>
                  date.toLocaleDateString(locale, { month: 'long' }),
                formatWeekdayName: (weekday) =>
                  weekday.toLocaleDateString(locale, { weekday: 'short' }),
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
};


const getDefaultValues = (transaction?: Transaction): FormValues => {
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
    pricePerShare: transaction.price_per_share ? transaction.price_per_share.toFixed(2) : '',
    fee: transaction.fee ? transaction.fee.toFixed(2) : '0.00',
    totalAmount: Math.abs(transaction.total_amount).toFixed(2),
    valueEur: transaction.eur_amount ? Math.abs(transaction.eur_amount).toFixed(2) : '',
    splitRatio: transaction.split_ratio?.toString() || '',
    fxRate: transaction.fx_rate ? transaction.fx_rate.toFixed(4) : '',
  };
};

const buildTransactionData = (values: FormValues): TransactionCreate => {
  const base: TransactionCreate = {
    date: new Date(`${values.date}T${values.time}`).toISOString(),
    type: values.type,
    total_amount: 0,
  };

  switch (values.type) {
    case TransactionType.DEPOSIT:
      base.total_amount = Math.abs(Number.parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim()) base.eur_amount = Math.abs(Number.parseFloat(values.valueEur));
      break;
    case TransactionType.WITHDRAW:
      base.total_amount = -Math.abs(Number.parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim()) base.eur_amount = -Math.abs(Number.parseFloat(values.valueEur));
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

// ─── Component ─────────────────────────────────────────────────────────────

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  transaction?: Transaction;
}

const TransactionModal = ({
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
  const holdings: Holding[] = portfolioStatus?.holdings ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(transaction),
  });

  const { reset, clearErrors } = form;
  const type = form.watch('type');
  const watchedTicker = form.watch('ticker');
  const watchedQuantity = form.watch('quantity');
  const watchedPrice = form.watch('pricePerShare');
  const watchedFee = form.watch('fee');

  const isSell = type === TransactionType.SELL;
  const selectedHolding = isSell ? holdings.find(h => h.ticker === watchedTicker) : undefined;

  useEffect(() => {
    if (isOpen) reset(getDefaultValues(transaction));
  }, [isOpen, transaction, reset]);

  // Auto-calculate totalAmount for BUY/SELL
  useEffect(() => {
    if (![TransactionType.BUY, TransactionType.SELL].includes(type)) return;
    const qty = Number.parseFloat(watchedQuantity || '0');
    const price = Number.parseFloat(watchedPrice || '0');
    const fee = Math.abs(Number.parseFloat(watchedFee || '0'));
    if (qty > 0 && price > 0) {
      form.setValue('totalAmount', (qty * price + fee).toFixed(2));
    }
  }, [watchedQuantity, watchedPrice, watchedFee, type, form]);

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

  const showTicker = [
    TransactionType.BUY,
    TransactionType.SELL,
    TransactionType.DIVIDEND,
    TransactionType.SPLIT,
  ].includes(type);
  const showQuantity = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showPricePerShare = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showFee = [TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND].includes(type);
  const showTotalAmount = type !== TransactionType.SPLIT;
  const showValueEur = [TransactionType.DEPOSIT, TransactionType.WITHDRAW].includes(type);
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
                    {isSell ? (
                      <Select
                        name="tx-ticker"
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const holding = holdings.find(h => h.ticker === value);
                          if (holding?.current_price != null) {
                            form.setValue('pricePerShare', holding.current_price.toFixed(2));
                          }
                        }}
                      >
                        <SelectTrigger id="tx-ticker" className="w-full" aria-invalid={fieldState.invalid}>
                          <SelectValue placeholder={t('transaction.modal.fields.sellTickerPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {holdings.length === 0 && (
                            <SelectItem value="__empty__" disabled>
                              {t('transaction.modal.fields.noHoldings')}
                            </SelectItem>
                          )}
                          {holdings.map(h => (
                            <SelectItem key={h.ticker} value={h.ticker}>
                              {h.ticker} ({h.quantity} shares)
                            </SelectItem>
                          ))}
                          {isEdit && transaction?.ticker && !holdings.some(h => h.ticker === transaction.ticker) && (
                            <SelectItem value={transaction.ticker}>
                              {transaction.ticker}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
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
          <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
            {t('transaction.modal.cancel')}
          </Button>
          <Button type="submit" form="transaction-form" disabled={isPending}>
            {isPending && <Spinner />}
            {isEdit ? t('transaction.modal.update') : t('transaction.modal.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionModal;

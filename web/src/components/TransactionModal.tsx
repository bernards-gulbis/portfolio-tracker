import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../hooks/useLocale';
import i18n from '../i18n/index';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { useLivePrices } from '../hooks/useLivePrices';
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CalendarIcon, ChevronsUpDown, Check } from 'lucide-react';
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

    if (TICKER_TYPES.has(type)) {
      if (!data.ticker?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ['ticker'],
          message: i18n.t('transaction.validation.tickerRequired'),
        });
      }
    }

    if (BUY_SELL_TYPES.has(type)) {
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

// ─── Constants ────────────────────────────────────────────────────────────

const TICKER_TYPES = new Set([TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND, TransactionType.SPLIT]);
const BUY_SELL_TYPES = new Set([TransactionType.BUY, TransactionType.SELL]);
const FEE_TYPES = new Set([TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND]);
const EUR_TYPES = new Set([TransactionType.DEPOSIT, TransactionType.WITHDRAW]);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Round a numeric string to 2 decimal places on blur */
const roundCurrencyOnBlur = (value: string | undefined, onChange: (v: string) => void) => {
  if (!value) return;
  const n = Number.parseFloat(value);
  if (!Number.isNaN(n)) onChange(n.toFixed(2));
};

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
  const [prevValue, setPrevValue] = useState(value);

  // Sync with external value changes (e.g. form reset) — adjust state during render
  if (prevValue !== value) {
    setPrevValue(value);
    setDisplayValue(value ?? '');
    const date = parseLocalDate(value);
    if (date) setMonth(date);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value;
    setDisplayValue(typed);
    const parsed = parseLocalDate(typed);
    if (parsed) {
      onChange(toLocalDate(parsed));
      setMonth(parsed);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const ymd = toLocalDate(date);
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

// ─── Ticker Combobox ────────────────────────────────────────────────────────

interface TickerComboboxProps {
  value: string;
  holdings: Holding[];
  editTicker?: string;
  invalid?: boolean;
  placeholder: string;
  noHoldingsText: string;
  onChange: (value: string) => void;
}

const TickerCombobox = ({ value, holdings, editTicker, invalid, placeholder, noHoldingsText, onChange }: TickerComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return holdings;
    const q = search.toUpperCase();
    return holdings.filter(h => h.ticker.toUpperCase().includes(q));
  }, [holdings, search]);

  // Show edit ticker as fallback if not in current holdings
  const showEditFallback = editTicker && !holdings.some(h => h.ticker === editTicker);

  const selectHolding = (ticker: string) => {
    onChange(ticker);
    setSearch('');
    setOpen(false);
  };

  const searchNorm = search.trim().toUpperCase();

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setSearch('');
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id="tx-ticker"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-full justify-between font-normal aria-invalid:border-destructive"
        >
          <span className={value ? '' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={v => setSearch(v.toUpperCase())}
            placeholder={placeholder}
            onKeyDown={e => {
              if (e.key === 'Enter' && searchNorm) {
                e.preventDefault();
                selectHolding(searchNorm);
              }
            }}
          />
          <CommandList className="max-h-48">
            {filtered.length === 0 && !searchNorm && !showEditFallback && (
              <CommandEmpty>{noHoldingsText}</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map(h => (
                <CommandItem
                  key={h.ticker}
                  value={h.ticker}
                  onSelect={() => selectHolding(h.ticker)}
                >
                  <Check className={`h-4 w-4 ${value === h.ticker ? 'opacity-100' : 'opacity-0'}`} />
                  {h.ticker} ({h.quantity} shares)
                </CommandItem>
              ))}
              {showEditFallback && (
                <CommandItem
                  value={editTicker}
                  onSelect={() => selectHolding(editTicker)}
                >
                  <Check className={`h-4 w-4 ${value === editTicker ? 'opacity-100' : 'opacity-0'}`} />
                  {editTicker}
                </CommandItem>
              )}
              {searchNorm && !holdings.some(h => h.ticker === searchNorm) && searchNorm !== editTicker && (
                <CommandItem
                  value={searchNorm}
                  onSelect={() => selectHolding(searchNorm)}
                >
                  <Check className="h-4 w-4 opacity-0" />
                  {searchNorm}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

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
                            if (livePrice != null) {
                              form.setValue('pricePerShare', livePrice.toFixed(2));
                              priceWasAutoFilled.current = true;
                              priceOwnerTicker.current = value;
                            } else {
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


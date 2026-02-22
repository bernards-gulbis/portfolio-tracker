import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { Transaction, TransactionType, TransactionCreate, getErrorMessage } from '../api';
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
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

// ─── Schema ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    date: z.string().min(1, 'Date is required'),
    time: z.string().min(1, 'Time is required'),
    type: z.nativeEnum(TransactionType),
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
          code: z.ZodIssueCode.custom,
          path: ['ticker'],
          message: 'Ticker symbol is required',
        });
      }
    }

    if ([TransactionType.BUY, TransactionType.SELL].includes(type)) {
      if (!(parseFloat(data.quantity || '0') > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: 'Quantity must be greater than 0',
        });
      }
      if (!(parseFloat(data.pricePerShare || '0') > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricePerShare'],
          message: 'Price per share must be greater than 0',
        });
      }
    }

    if (type === TransactionType.SPLIT) {
      if (!(parseFloat(data.splitRatio || '0') > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['splitRatio'],
          message: 'Split ratio must be greater than 0',
        });
      }
    }

    if (type !== TransactionType.SPLIT) {
      if (!(parseFloat(data.totalAmount || '0') > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['totalAmount'],
          message: 'Total amount must be greater than 0',
        });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

// ─── Helpers ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** Returns local date as "YYYY-MM-DD" */
const toLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Returns local time as "HH:mm" */
const toLocalTime = (date: Date): string => {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
};

/** Parses "YYYY-MM-DD" to a local Date without UTC shift */
const parseLocalDate = (str: string): Date | undefined => {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Formats "YYYY-MM-DD" for display in the calendar trigger */
const formatDateDisplay = (str: string): string => {
  const date = parseLocalDate(str);
  if (!date) return str;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      base.total_amount = Math.abs(parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim()) base.eur_amount = Math.abs(parseFloat(values.valueEur));
      break;
    case TransactionType.WITHDRAW:
      base.total_amount = -Math.abs(parseFloat(values.totalAmount || '0'));
      if (values.valueEur?.trim()) base.eur_amount = -Math.abs(parseFloat(values.valueEur));
      break;
    case TransactionType.FEE:
      base.total_amount = -Math.abs(parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.BUY:
      base.ticker = values.ticker;
      base.quantity = parseFloat(values.quantity || '0');
      base.price_per_share = parseFloat(values.pricePerShare || '0');
      base.fee = Math.abs(parseFloat(values.fee || '0'));
      base.total_amount = -Math.abs(parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.SELL:
      base.ticker = values.ticker;
      base.quantity = parseFloat(values.quantity || '0');
      base.price_per_share = parseFloat(values.pricePerShare || '0');
      base.fee = Math.abs(parseFloat(values.fee || '0'));
      base.total_amount = Math.abs(parseFloat(values.totalAmount || '0'));
      break;
    case TransactionType.DIVIDEND:
      base.ticker = values.ticker;
      base.total_amount = Math.abs(parseFloat(values.totalAmount || '0'));
      if (values.fee?.trim()) base.fee = Math.abs(parseFloat(values.fee));
      if (values.fxRate?.trim()) base.fx_rate = parseFloat(values.fxRate);
      break;
    case TransactionType.SPLIT:
      base.ticker = values.ticker;
      base.split_ratio = parseFloat(values.splitRatio || '1');
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
  const isEdit = !!transaction;
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: getDefaultValues(transaction),
  });

  const { reset, clearErrors } = form;
  const type = form.watch('type');

  useEffect(() => {
    if (isOpen) reset(getDefaultValues(transaction));
  }, [isOpen, transaction, reset]);

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
          <DialogTitle>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Form to edit an existing transaction' : 'Form to add a new transaction'}
          </DialogDescription>
        </DialogHeader>

        <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="py-4">

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              {/* Date — text input (keyboard typeable) + Calendar popover */}
              <Controller
                name="date"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined}>
                    <FieldLabel htmlFor="tx-date">Date</FieldLabel>
                    <div className="flex">
                      <Input
                        {...field}
                        id="tx-date"
                        type="text"
                        placeholder="YYYY-MM-DD"
                        autoComplete="off"
                        className="rounded-r-none"
                        aria-invalid={fieldState.invalid}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            tabIndex={-1}
                            className="rounded-l-none border-l-0 shrink-0 px-3"
                            aria-label="Pick date from calendar"
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(field.value)}
                            onSelect={(date) =>
                              field.onChange(date ? toLocalDate(date) : '')
                            }
                            initialFocus
                          />
                          {field.value && (
                            <p className="px-3 pb-3 text-center text-sm text-muted-foreground">
                              {formatDateDisplay(field.value)}
                            </p>
                          )}
                        </PopoverContent>
                      </Popover>
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              {/* Time — hour + minute Selects (fully themed, no native popup) */}
              <Controller
                name="time"
                control={form.control}
                render={({ field, fieldState }) => {
                  const [hh, mm] = (field.value || '00:00').split(':');
                  return (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="tx-time-hour">Time</FieldLabel>
                      <div className="flex items-center gap-1">
                        <Select
                          name="tx-time-hour"
                          value={hh}
                          onValueChange={(h) => field.onChange(`${h}:${mm}`)}
                        >
                          <SelectTrigger id="tx-time-hour" aria-label="Hour">
                            <SelectValue placeholder="HH" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {HOURS.map((h) => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground text-sm font-medium shrink-0">:</span>
                        <Select
                          name="tx-time-minute"
                          value={mm}
                          onValueChange={(m) => field.onChange(`${hh}:${m}`)}
                        >
                          <SelectTrigger id="tx-time-minute" aria-label="Minute">
                            <SelectValue placeholder="MM" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48">
                            {MINUTES.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  );
                }}
              />
            </div>

            {/* Transaction Type */}
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="tx-type">Transaction Type</FieldLabel>
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
                      <SelectItem value={TransactionType.DEPOSIT}>Deposit</SelectItem>
                      <SelectItem value={TransactionType.WITHDRAW}>Withdraw</SelectItem>
                      <SelectItem value={TransactionType.BUY}>Buy</SelectItem>
                      <SelectItem value={TransactionType.SELL}>Sell</SelectItem>
                      <SelectItem value={TransactionType.DIVIDEND}>Dividend</SelectItem>
                      <SelectItem value={TransactionType.FEE}>Fee</SelectItem>
                      <SelectItem value={TransactionType.SPLIT}>Split</SelectItem>
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
                    <FieldLabel htmlFor="tx-ticker">Ticker</FieldLabel>
                    <Input
                      {...field}
                      id="tx-ticker"
                      placeholder="e.g., AAPL"
                      autoComplete="off"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      aria-invalid={fieldState.invalid}
                    />
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
                    <FieldLabel htmlFor="tx-quantity">Quantity</FieldLabel>
                    <Input
                      {...field}
                      id="tx-quantity"
                      type="number"
                      step="0.00000001"
                      min="0.00000001"
                      placeholder="Number of shares"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
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
                    <FieldLabel htmlFor="tx-price">Price per Share</FieldLabel>
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
                    <FieldLabel htmlFor="tx-fee">Fee</FieldLabel>
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
                    <FieldLabel htmlFor="tx-total">Total Amount</FieldLabel>
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
                    <FieldLabel htmlFor="tx-eur">Amount in EUR</FieldLabel>
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
                    <FieldLabel htmlFor="tx-split">Split Ratio</FieldLabel>
                    <Input
                      {...field}
                      id="tx-split"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g., 2 for 2-for-1 split"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Enter the split ratio (e.g., 2 for a 2-for-1 split)
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
                    <FieldLabel htmlFor="tx-fx">FX Rate</FieldLabel>
                    <Input
                      {...field}
                      id="tx-fx"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      placeholder="e.g., 1.0850"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>Exchange rate used for currency conversion</FieldDescription>
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
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" disabled={isPending}>
            {isPending
              ? isEdit ? 'Updating...' : 'Adding...'
              : isEdit ? 'Update' : 'Add Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionModal;

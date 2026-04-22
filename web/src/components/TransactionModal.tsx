import { useLocale } from '../hooks/useLocale';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Transaction, TransactionType } from '../api';
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
import { roundCurrencyOnBlur } from './transaction-form/helpers';
import { useTransactionForm } from './transaction-form/useTransactionForm';

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

  const {
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
    onSubmit,
    handleClose,
    applyTickerSideEffects,
    markPriceAsUserEdited,
  } = useTransactionForm({ isOpen, portfolioId, transaction, onClose });

  const { clearErrors } = form;

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
                          applyTickerSideEffects(value);
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
                          markPriceAsUserEdited();
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

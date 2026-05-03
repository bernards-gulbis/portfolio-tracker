import { useLocale } from '../hooks/useLocale';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Transaction } from '../api';
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
import { DatePickerField } from './transaction-form/DatePickerField';
import { TickerCombobox } from './transaction-form/TickerCombobox';
import { MoneyField, NumberField } from './transaction-form/fields';
import { TRANSACTION_TYPE_ORDER } from './transaction-form/schema';
import { useTransactionForm } from './transaction-form/useTransactionForm';
import { CollapsibleSection } from './portfolio-status/CollapsibleSection';

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
    eurRate,
    onSubmit,
    handleClose,
    applyTickerSideEffects,
    markPriceAsUserEdited,
    markTotalAsUserEdited,
    markValueEurAsUserEdited,
  } = useTransactionForm({ isOpen, portfolioId, transaction, onClose });

  const { control, clearErrors } = form;
  const watchedDate = form.watch('date');
  const watchedTotalAmount = form.watch('totalAmount');

  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isFutureDate = watchedDate > todayLocal;

  const totalAmountEurHint = (() => {
    if (eurRate == null || eurRate <= 0) return null;
    const total = Number.parseFloat(watchedTotalAmount || '0');
    if (!(total > 0)) return null;
    return t('transaction.modal.fields.totalAmountEurHint', {
      eur: (total * eurRate).toFixed(2),
      rate: (1 / eurRate).toFixed(4),
    });
  })();

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
            <Controller
              name="date"
              control={control}
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
                  {isFutureDate && (
                    <FieldDescription>
                      {t('transaction.modal.fields.futureDateWarning')}
                    </FieldDescription>
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="type"
              control={control}
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
                      {TRANSACTION_TYPE_ORDER.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`transaction.modal.types.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            {showTicker && (
              <Controller
                name="ticker"
                control={control}
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

            {showQuantity && (
              <Controller
                name="quantity"
                control={control}
                render={({ field, fieldState }) => {
                  const showSellAll = isSell && selectedHolding;
                  const input = (
                    <Input
                      {...field}
                      id="tx-quantity"
                      type="number"
                      step="0.00000001"
                      min="0.00000001"
                      placeholder={t('transaction.modal.fields.quantityPlaceholder')}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      className={showSellAll ? 'flex-1' : undefined}
                    />
                  );
                  return (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="tx-quantity">{t('transaction.modal.fields.quantity')}</FieldLabel>
                      {showSellAll ? (
                        <div className="flex gap-2">
                          {input}
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
                        input
                      )}
                      {showSellAll && (
                        <FieldDescription>
                          {t('transaction.modal.fields.availableQuantity', { quantity: selectedHolding.quantity })}
                        </FieldDescription>
                      )}
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  );
                }}
              />
            )}

            {showPricePerShare && (
              <MoneyField
                control={control}
                name="pricePerShare"
                id="tx-price"
                label={t('transaction.modal.fields.pricePerShare')}
                min="0.01"
                currency="USD"
                onValueChange={markPriceAsUserEdited}
              />
            )}

            {showTotalAmount && (
              <>
                <MoneyField
                  control={control}
                  name="totalAmount"
                  id="tx-total"
                  label={t('transaction.modal.fields.totalAmount')}
                  min="0.01"
                  currency="USD"
                  onValueChange={markTotalAsUserEdited}
                />
                {totalAmountEurHint && (
                  <FieldDescription className="-mt-2">
                    {totalAmountEurHint}
                  </FieldDescription>
                )}
              </>
            )}

            {showValueEur && (
              <MoneyField
                control={control}
                name="valueEur"
                id="tx-eur"
                label={t('transaction.modal.fields.amountInEur')}
                currency="EUR"
                onValueChange={markValueEurAsUserEdited}
              />
            )}

            {showSplitRatio && (
              <NumberField
                control={control}
                name="splitRatio"
                id="tx-split"
                label={t('transaction.modal.fields.splitRatio')}
                placeholder={t('transaction.modal.fields.splitRatioPlaceholder')}
                step="0.01"
                min="0.01"
                description={t('transaction.modal.fields.splitRatioDescription')}
              />
            )}

            <CollapsibleSection
              title={t('transaction.modal.fields.advanced')}
              defaultOpen={isEdit}
            >
              <div className="space-y-4">
                <Controller
                  name="time"
                  control={control}
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

                {showFee && (
                  <MoneyField
                    control={control}
                    name="fee"
                    id="tx-fee"
                    label={t('transaction.modal.fields.fee')}
                    currency="USD"
                  />
                )}

                {showFxRate && (
                  <NumberField
                    control={control}
                    name="fxRate"
                    id="tx-fx"
                    label={t('transaction.modal.fields.fxRate')}
                    placeholder={t('transaction.modal.fields.fxRatePlaceholder')}
                    step="0.0001"
                    min="0.0001"
                    description={t('transaction.modal.fields.fxRateDescription')}
                  />
                )}
              </div>
            </CollapsibleSection>

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

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useUpdateTaxRate } from '../../hooks/useAuth';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Info } from 'lucide-react';
import { taxSchema, type TaxFormValues } from './schemas';
import { useWarnUnsavedChanges } from './useWarnUnsavedChanges';

export const TaxSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const updateTaxRate = useUpdateTaxRate();

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxSchema),
    defaultValues: { taxRate: (user?.tax_rate ?? 0.255) * 100 },
  });

  useWarnUnsavedChanges(form.formState.isDirty);

  const onSubmit = async (values: TaxFormValues) => {
    try {
      await updateTaxRate.mutateAsync({ tax_rate: values.taxRate / 100 });
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t('settings.tax.taxExplanation')}</AlertDescription>
      </Alert>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="taxRate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="settings-tax-rate">{t('settings.tax.rateLabel')}</FieldLabel>
                <Input
                  {...field}
                  id="settings-tax-rate"
                  type="number"
                  step="0.1"
                  className="max-w-md"
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {form.formState.errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={updateTaxRate.isPending}>
            {updateTaxRate.isPending && <Spinner />}
            {t('settings.tax.submit')}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
};

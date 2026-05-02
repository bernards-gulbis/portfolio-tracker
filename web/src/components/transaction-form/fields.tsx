import type { ReactElement } from 'react';
import { Controller, type Control } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

import type { FormValues } from './schema';
import { roundCurrencyOnBlur } from './helpers';

type MoneyFieldName = 'pricePerShare' | 'fee' | 'totalAmount' | 'valueEur';

type MoneyCurrency = 'USD' | 'EUR';

const CURRENCY_SYMBOL: Record<MoneyCurrency, string> = { USD: '$', EUR: '€' };

interface MoneyFieldProps {
  control: Control<FormValues>;
  name: MoneyFieldName;
  id: string;
  label: string;
  placeholder?: string;
  step?: string;
  min?: string;
  currency: MoneyCurrency;
  onValueChange?: () => void;
}

export function MoneyField({
  control,
  name,
  id,
  label,
  placeholder = '0.00',
  step = '0.01',
  min,
  currency,
  onValueChange,
}: MoneyFieldProps): ReactElement {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>{CURRENCY_SYMBOL[currency]}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              {...field}
              id={id}
              type="number"
              step={step}
              min={min}
              placeholder={placeholder}
              autoComplete="off"
              aria-invalid={fieldState.invalid}
              onChange={(e) => {
                field.onChange(e);
                onValueChange?.();
              }}
              onBlur={() => roundCurrencyOnBlur(field.value, field.onChange)}
            />
            {currency === 'EUR' && (
              <InputGroupAddon align="inline-end">
                <InputGroupText>EUR</InputGroupText>
              </InputGroupAddon>
            )}
          </InputGroup>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

type NumberFieldName = 'splitRatio' | 'fxRate';

interface NumberFieldProps {
  control: Control<FormValues>;
  name: NumberFieldName;
  id: string;
  label: string;
  placeholder: string;
  step: string;
  min: string;
  description?: string;
}

export function NumberField({
  control,
  name,
  id,
  label,
  placeholder,
  step,
  min,
  description,
}: NumberFieldProps): ReactElement {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...field}
            id={id}
            type="number"
            step={step}
            min={min}
            placeholder={placeholder}
            autoComplete="off"
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

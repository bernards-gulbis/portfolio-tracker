import React from 'react';
import { formatSignedCurrency, formatSignedPercent } from '../../utils/formatters';
import type { Currency } from '../../hooks/useCurrencyPreference';

export const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US'
): React.JSX.Element | string => {
  if (currencyValue == null) return '-';
  const formattedCurrency = formatSignedCurrency(currencyValue, currency, locale);
  const formattedPercent = percentValue == null ? '' : formatSignedPercent(percentValue);
  const percentClass = currencyValue >= 0 ? 'text-positive' : 'text-negative';
  return (
    <>
      <span>{formattedCurrency}</span>
      {formattedPercent && <span className={`${percentClass} font-bold ml-1.5`}>{formattedPercent}</span>}
    </>
  );
};

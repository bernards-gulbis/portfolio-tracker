import React from 'react';

import type { Currency } from '../../hooks/useCurrencyPreference';
import { formatSignedCurrency, formatSignedPercent } from '../../utils/formatters';

export const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US',
): React.JSX.Element | string => {
  if (currencyValue == null) return '-';
  const percentClass = currencyValue >= 0 ? 'text-positive' : 'text-negative';
  return (
    <>
      <span>{formatSignedCurrency(currencyValue, currency, locale)}</span>
      {percentValue != null && (
        <span className={`${percentClass} font-bold ml-1.5`}>
          {formatSignedPercent(percentValue)}
        </span>
      )}
    </>
  );
};

import React from 'react';

import type { Currency } from '../../hooks/useCurrencyPreference';
import { formatSignedCurrency, formatSignedPercentPlain } from '../../utils/formatters';

/** Uniform `gap-1.5` between arrow, money, and percent so spacing matches the
 *  inline pair layout used in HoldingsTable rows. Arrow inherits the caller's color. */
export const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US',
): React.JSX.Element | string => {
  if (currencyValue == null) return '-';
  const arrow = currencyValue >= 0 ? '▲' : '▼';
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span aria-hidden>{arrow}</span>
      <span>{formatSignedCurrency(currencyValue, currency, locale)}</span>
      {percentValue != null && (
        <span>{formatSignedPercentPlain(percentValue)}</span>
      )}
    </span>
  );
};

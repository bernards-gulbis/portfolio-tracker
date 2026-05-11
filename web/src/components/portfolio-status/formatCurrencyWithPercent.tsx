import React from 'react';

import type { Currency } from '../../hooks/useCurrencyPreference';
import { formatSignedCurrency, formatSignedPercentPlain } from '../../utils/formatters';

/** Renders `▲ +€1,234  +3.33%`: leading arrow as the dominant glyph, signed money,
 *  signed percent without its own arrow. The arrow inherits the value's color via
 *  the caller's surrounding class (or the default positive/negative class here). */
export const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US',
): React.JSX.Element | string => {
  if (currencyValue == null) return '-';
  const arrow = currencyValue >= 0 ? '▲' : '▼';
  return (
    <>
      <span className="mr-1">{arrow}</span>
      <span>{formatSignedCurrency(currencyValue, currency, locale)}</span>
      {percentValue != null && (
        <span className="ml-1.5">{formatSignedPercentPlain(percentValue)}</span>
      )}
    </>
  );
};

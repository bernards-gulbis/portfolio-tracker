import React from 'react';

import type { Currency } from '../../hooks/useCurrencyPreference';

import { SignedDelta } from './SignedDelta';

/** Thin wrapper around {@link SignedDelta} preserved for legacy call sites that
 *  embed the arrow/value/percent triple inline. The caller controls the colour
 *  (passes ``colored={false}``) so it can sit inside a span that already carries
 *  a value class — matches the historical behaviour of inheriting the parent's
 *  color. New code should use {@link SignedDelta} directly. */
export const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US',
): React.JSX.Element => (
  <SignedDelta
    value={currencyValue}
    pct={percentValue}
    currency={currency}
    locale={locale}
    colored={false}
  />
);

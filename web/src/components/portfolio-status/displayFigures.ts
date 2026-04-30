import type { PricedPortfolioStatus } from '../../api';
import type { EurMetrics } from '../../utils/eurMetrics';
import type { Currency } from '../../hooks/useCurrencyPreference';

export interface DisplayFigures {
  totalValue: number | null;
  netInvested: number | null;
  totalReturn: number | null;
  estimatedTax: number | null;
  afterTaxValue: number | null;
  /** Only populated in EUR mode, otherwise null. */
  fxImpact: number | null;
  /** Only populated in EUR mode, otherwise null. */
  fxImpactPct: number | null;
}

/**
 * Resolve all summary-card figures from a status + EUR metrics + selected
 * display currency. Pure: no React, no hooks. Mirrors the original inline
 * computations from PortfolioStatusContent so the math is unchanged.
 */
export const computeDisplayFigures = (
  status: PricedPortfolioStatus,
  eur: EurMetrics | null,
  currency: Currency,
): DisplayFigures => {
  const showEur = currency === 'EUR';

  const totalValue = showEur ? (eur?.currentValueEur ?? null) : status.current_value;
  const netInvested = showEur ? status.principal_eur : status.principal;

  // Total return = current value - net invested. In EUR mode, principal_eur
  // can be null (incomplete FX data) — show "—" rather than NaN.
  const totalReturn =
    totalValue == null || netInvested == null ? null : totalValue - netInvested;

  // After-tax value: total value minus estimated capital gains tax. In EUR
  // mode this depends on the EUR aggregates being complete; ``eur.taxEur`` is
  // null when any of them are missing.
  const estimatedTax = (() => {
    if (totalValue == null) return null;
    if (showEur) return eur?.taxEur ?? null;
    const capitalGains = totalValue - status.principal - status.dividends;
    return capitalGains > 0 ? capitalGains * status.capital_gains_tax_rate : 0;
  })();
  const afterTaxValue =
    totalValue != null && estimatedTax != null ? totalValue - estimatedTax : null;

  const fxImpact = showEur ? (eur?.currencyGainsEur ?? null) : null;
  const fxImpactPct = showEur ? (eur?.currencyGainsPct ?? null) : null;

  return {
    totalValue,
    netInvested,
    totalReturn,
    estimatedTax,
    afterTaxValue,
    fxImpact,
    fxImpactPct,
  };
};

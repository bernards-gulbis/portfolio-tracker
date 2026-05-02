import type { PricedPortfolioStatus } from '../../api';
import type { Currency } from '../../hooks/useCurrencyPreference';
import type { EurMetrics } from '../../utils/eurMetrics';

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

const computeUsdTax = (status: PricedPortfolioStatus, totalValue: number): number => {
  const capitalGains = totalValue - status.principal - status.dividends;
  return capitalGains > 0 ? capitalGains * status.capital_gains_tax_rate : 0;
};

/**
 * Resolve all summary-card figures from a status + EUR metrics + selected
 * display currency. Pure: no React, no hooks.
 */
export const computeDisplayFigures = (
  status: PricedPortfolioStatus,
  eur: EurMetrics | null,
  currency: Currency,
): DisplayFigures => {
  const showEur = currency === 'EUR';

  const totalValue = showEur ? (eur?.currentValueEur ?? null) : status.current_value;
  const netInvested = showEur ? status.principal_eur : status.principal;

  const totalReturn =
    totalValue == null || netInvested == null ? null : totalValue - netInvested;

  let estimatedTax: number | null = null;
  if (totalValue != null) {
    estimatedTax = showEur ? (eur?.taxEur ?? null) : computeUsdTax(status, totalValue);
  }

  const afterTaxValue =
    totalValue != null && estimatedTax != null ? totalValue - estimatedTax : null;

  return {
    totalValue,
    netInvested,
    totalReturn,
    estimatedTax,
    afterTaxValue,
    fxImpact: showEur ? (eur?.currencyGainsEur ?? null) : null,
    fxImpactPct: showEur ? (eur?.currencyGainsPct ?? null) : null,
  };
};

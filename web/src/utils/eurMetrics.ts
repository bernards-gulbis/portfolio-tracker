import type { PricedHolding, PricedPortfolioStatus, WithdrawalFx } from '../api';

export interface EurMetrics {
  rate: number;
  currentValueEur: number | null;
  unrealizedGainsEur: number | null;
  currencyGainsEur: number;
  currencyGainsPct: number | null;
  capitalGainsEur: number | null;
  taxEur: number | null;
  totalReturnAfterTaxEur: number | null;
  totalReturnAfterTaxPct: number | null;
  currentValueAfterTaxEur: number | null;
  cashEur: number;
}

export interface HoldingEurValues {
  averageCostEur: number;
  totalCostEur: number;
  currentPriceEur: number | null;
  currentValueEur: number | null;
  unrealizedGainLossEur: number | null;
}

/**
 * Compute all EUR-denominated portfolio metrics from a PricedPortfolioStatus + live rate.
 * Returns null when usd_to_eur_rate is null (rate unavailable).
 * Mirrors the logic previously in _compute_eur_metrics + _compute_tax_metrics.
 */
export const computeEurMetrics = (status: PricedPortfolioStatus): EurMetrics | null => {
  const rate = status.usd_to_eur_rate;
  if (rate === null || rate === undefined) return null;

  const currentValueEur = status.current_value == null ? null : status.current_value * rate;
  const unrealizedGainsEur = status.unrealized_gains == null ? null : status.unrealized_gains * rate;
  const currencyGainsEur = status.principal * rate - status.principal_eur_avg;
  const currencyGainsPct =
    status.principal_eur_avg > 0 ? (currencyGainsEur / status.principal_eur_avg) * 100 : null;
  const cashEur = status.cash * rate;

  // Skip tax when current value is unavailable (prices not loaded) or dividends EUR is missing
  const skipTax = currentValueEur == null || (status.dividends > 0 && status.dividends_eur === null);
  let capitalGainsEur: number | null = null;
  let taxEur: number | null = null;
  let totalReturnAfterTaxEur: number | null = null;
  let totalReturnAfterTaxPct: number | null = null;
  let currentValueAfterTaxEur: number | null = null;

  if (!skipTax && currentValueEur != null) {
    const dividendsForTax = status.dividends_eur ?? 0;
    capitalGainsEur = currentValueEur - status.principal_eur - dividendsForTax;
    taxEur = capitalGainsEur > 0 ? capitalGainsEur * status.capital_gains_tax_rate : 0;
    currentValueAfterTaxEur = currentValueEur - taxEur;
    totalReturnAfterTaxEur = currentValueEur - status.principal_eur - taxEur;
    totalReturnAfterTaxPct =
      status.principal_eur > 0 ? (totalReturnAfterTaxEur / status.principal_eur) * 100 : null;
  }

  return {
    rate,
    currentValueEur,
    unrealizedGainsEur,
    currencyGainsEur,
    currencyGainsPct,
    capitalGainsEur,
    taxEur,
    totalReturnAfterTaxEur,
    totalReturnAfterTaxPct,
    currentValueAfterTaxEur,
    cashEur,
  };
};

/**
 * Compute per-withdrawal taxable amounts.
 * In the Latvian model, withdrawals are tax-free up to (total deposited EUR + dividends EUR).
 * Returns a Map from original array index → taxable EUR amount for that withdrawal.
 */
export const computeWithdrawalTaxMap = (
  withdrawals: WithdrawalFx[],
  principalEur: number,
  dividendsEur: number | null,
): Map<number, number> => {
  const totalWithdrawnEur = withdrawals.reduce((s, w) => s + w.amount_eur, 0);
  const totalDepositedEur = principalEur + totalWithdrawnEur;
  const threshold = totalDepositedEur + (dividendsEur ?? 0);

  const indexed = withdrawals.map((w, i) => ({ w, i }));
  indexed.sort((a, b) => a.w.date.localeCompare(b.w.date));
  const map = new Map<number, number>();
  let running = 0;
  let prevTaxable = 0;
  for (const { w, i } of indexed) {
    running += w.amount_eur;
    const cumTaxable = Math.max(0, running - threshold);
    const taxableThisRow = cumTaxable - prevTaxable;
    prevTaxable = cumTaxable;
    map.set(i, taxableThisRow);
  }
  return map;
};

/** Compute EUR values for a single holding by applying the live rate to USD fields. */
export const applyRateToHolding = (holding: PricedHolding, rate: number): HoldingEurValues => ({
  averageCostEur: holding.average_cost * rate,
  totalCostEur: holding.total_cost * rate,
  currentPriceEur: holding.current_price == null ? null : holding.current_price * rate,
  currentValueEur: holding.current_value == null ? null : holding.current_value * rate,
  unrealizedGainLossEur:
    holding.unrealized_gain_loss == null ? null : holding.unrealized_gain_loss * rate,
});

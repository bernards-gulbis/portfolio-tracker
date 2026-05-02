import type { PricedHolding, PricedPortfolioStatus, WithdrawalFx } from '../api';

export interface EurMetrics {
  rate: number;
  currentValueEur: number | null;
  unrealizedGainsEur: number | null;
  currencyGainsEur: number | null;
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
 * Tax-related fields return null when any underlying EUR aggregate is missing — using
 * a partial sum would silently over- or understate the figure.
 */
export const computeEurMetrics = (status: PricedPortfolioStatus): EurMetrics | null => {
  const rate = status.usd_to_eur_rate;
  if (rate == null) return null;

  const currentValueEur = status.current_value == null ? null : status.current_value * rate;
  const unrealizedGainsEur = status.unrealized_gains == null ? null : status.unrealized_gains * rate;
  const cashEur = status.cash * rate;

  const principalEurAvg = status.principal_eur_avg;
  const currencyGainsEur = principalEurAvg == null ? null : status.principal * rate - principalEurAvg;
  const currencyGainsPct =
    currencyGainsEur != null && principalEurAvg != null && principalEurAvg > 0
      ? (currencyGainsEur / principalEurAvg) * 100
      : null;

  const principalEur = status.principal_eur;
  const dividendsEurMissing = status.dividends > 0 && status.dividends_eur == null;
  const canComputeTax = currentValueEur != null && principalEur != null && !dividendsEurMissing;

  let capitalGainsEur: number | null = null;
  let taxEur: number | null = null;
  let totalReturnAfterTaxEur: number | null = null;
  let totalReturnAfterTaxPct: number | null = null;
  let currentValueAfterTaxEur: number | null = null;

  if (canComputeTax && currentValueEur != null && principalEur != null) {
    const dividendsForTax = status.dividends_eur ?? 0;
    capitalGainsEur = currentValueEur - principalEur - dividendsForTax;
    taxEur = capitalGainsEur > 0 ? capitalGainsEur * status.capital_gains_tax_rate : 0;
    currentValueAfterTaxEur = currentValueEur - taxEur;
    totalReturnAfterTaxEur = currentValueEur - principalEur - taxEur;
    totalReturnAfterTaxPct =
      principalEur > 0 ? (totalReturnAfterTaxEur / principalEur) * 100 : null;
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
 * Compute per-withdrawal taxable amounts. In the Latvian model, withdrawals are
 * tax-free up to (total deposited EUR + dividends EUR). Returns a Map from original
 * array index → taxable EUR amount. Returns an empty map when EUR aggregates are
 * incomplete so callers render "—" rather than a wrong number.
 */
export const computeWithdrawalTaxMap = (
  withdrawals: WithdrawalFx[],
  principalEur: number | null,
  dividendsEur: number | null,
): Map<number, number> => {
  if (principalEur == null || dividendsEur == null) return new Map();

  const usableWithdrawals = withdrawals.filter(
    (w): w is WithdrawalFx & { amount_eur: number } => w.amount_eur != null,
  );
  const totalWithdrawnEur = usableWithdrawals.reduce((s, w) => s + w.amount_eur, 0);
  const threshold = principalEur + totalWithdrawnEur + dividendsEur;

  const indexed = withdrawals
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.amount_eur != null);
  indexed.sort((a, b) => a.w.date.localeCompare(b.w.date));

  const map = new Map<number, number>();
  let running = 0;
  let prevTaxable = 0;
  for (const { w, i } of indexed) {
    running += w.amount_eur as number;
    const cumTaxable = Math.max(0, running - threshold);
    map.set(i, cumTaxable - prevTaxable);
    prevTaxable = cumTaxable;
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

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
 * Returns null when usd_to_eur_rate is null (rate unavailable).
 *
 * Tax / total-return-after-tax / FX-impact metrics also return null when their
 * underlying EUR aggregates (``principal_eur``, ``principal_eur_avg``, or
 * ``dividends_eur``) are null — i.e. when the backend reports incomplete EUR
 * data for any contributing transaction. Computing tax against a partial sum
 * would silently overstate or understate the figure.
 */
export const computeEurMetrics = (status: PricedPortfolioStatus): EurMetrics | null => {
  const rate = status.usd_to_eur_rate;
  if (rate === null || rate === undefined) return null;

  const currentValueEur = status.current_value == null ? null : status.current_value * rate;
  const unrealizedGainsEur = status.unrealized_gains == null ? null : status.unrealized_gains * rate;
  const cashEur = status.cash * rate;

  // Currency gains compare today's USD principal converted at the live rate
  // against the EUR principal accumulated at historical rates. Both inputs
  // must be defined; otherwise the difference is meaningless.
  const currencyGainsEur =
    status.principal_eur_avg == null ? null : status.principal * rate - status.principal_eur_avg;
  const currencyGainsPct =
    status.principal_eur_avg == null || status.principal_eur_avg <= 0
      ? null
      : currencyGainsEur == null
      ? null
      : (currencyGainsEur / status.principal_eur_avg) * 100;

  // Skip tax when any EUR aggregate it depends on is unavailable — current
  // value, principal, or dividends-with-no-conversion. Using a partial sum
  // would yield a silently-wrong tax figure.
  const skipTax =
    currentValueEur == null ||
    status.principal_eur == null ||
    (status.dividends > 0 && status.dividends_eur == null);
  let capitalGainsEur: number | null = null;
  let taxEur: number | null = null;
  let totalReturnAfterTaxEur: number | null = null;
  let totalReturnAfterTaxPct: number | null = null;
  let currentValueAfterTaxEur: number | null = null;

  if (!skipTax && currentValueEur != null && status.principal_eur != null) {
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
 *
 * When ``principalEur`` is null (some deposits lack a historical FX rate), the
 * taxable threshold cannot be computed accurately — the function returns an
 * empty map so callers render "—" instead of a wrong number.
 */
export const computeWithdrawalTaxMap = (
  withdrawals: WithdrawalFx[],
  principalEur: number | null,
  dividendsEur: number | null,
): Map<number, number> => {
  if (principalEur == null) return new Map();
  const usableWithdrawals = withdrawals.filter(
    (w): w is WithdrawalFx & { amount_eur: number } => w.amount_eur != null,
  );
  const totalWithdrawnEur = usableWithdrawals.reduce((s, w) => s + w.amount_eur, 0);
  const totalDepositedEur = principalEur + totalWithdrawnEur;
  const threshold = totalDepositedEur + (dividendsEur ?? 0);

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

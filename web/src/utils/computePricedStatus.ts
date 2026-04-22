import type { LivePrices, PricedHolding, PricedPortfolioStatus, PortfolioStatus } from '../api';

/**
 * Compute a fully-priced portfolio status from transaction-derived status + live prices.
 *
 * When livePrices has no data (empty prices map), all price fields are null and
 * missing_prices is empty (prices not yet loaded — don't show warnings).
 *
 * When a ticker has an explicitly null price in livePrices, holding price fields
 * become null and the ticker is added to missing_prices.
 */
export const computePricedStatus = (
  status: PortfolioStatus,
  livePrices: LivePrices,
): PricedPortfolioStatus => {
  const hasLivePrices = Object.keys(livePrices.prices).length > 0;
  const missingPrices: string[] = [];

  const pricedHoldings: PricedHolding[] = status.holdings.map((h) => {
    if (!hasLivePrices) {
      return {
        ...h,
        current_price: null,
        current_value: null,
        unrealized_gain_loss: null,
        unrealized_gain_loss_pct: null,
        price_source: 'missing',
        price_as_of: null,
      };
    }

    const info = livePrices.prices[h.ticker];
    const price = info?.price ?? null;
    const source = info?.source ?? 'missing';
    const asOf = info?.as_of ?? null;

    if (price == null) {
      missingPrices.push(h.ticker);
      return {
        ...h,
        current_price: null,
        current_value: null,
        unrealized_gain_loss: null,
        unrealized_gain_loss_pct: null,
        price_source: source,
        price_as_of: asOf,
      };
    }

    const currentValue = price * h.quantity;
    const unrealizedGainLoss = currentValue - h.total_cost;
    const unrealizedGainLossPct =
      h.total_cost === 0 ? null : (unrealizedGainLoss / h.total_cost) * 100;

    return {
      ...h,
      current_price: price,
      current_value: currentValue,
      unrealized_gain_loss: unrealizedGainLoss,
      unrealized_gain_loss_pct: unrealizedGainLossPct,
      price_source: source,
      price_as_of: asOf,
    };
  });

  let holdingsValue: number | null = null;
  let currentValue: number | null = null;
  let unrealizedGains: number | null = null;
  let unrealizedGainsPct: number | null = null;

  if (hasLivePrices) {
    // Holdings with null current_value (missing price) are treated as zero
    holdingsValue = pricedHoldings.reduce(
      (sum, h) => sum + (h.current_value ?? 0),
      0,
    );
    currentValue = status.cash + holdingsValue;
    unrealizedGains = holdingsValue - status.holdings_cost;
    unrealizedGainsPct =
      status.holdings_cost === 0
        ? null
        : (unrealizedGains / status.holdings_cost) * 100;
  }

  return {
    ...status,
    holdings: pricedHoldings,
    current_value: currentValue,
    holdings_value: holdingsValue,
    unrealized_gains: unrealizedGains,
    unrealized_gains_pct: unrealizedGainsPct,
    missing_prices: missingPrices,
    usd_to_eur_rate: livePrices.usd_to_eur_rate ?? status.usd_to_eur_rate,
  };
};

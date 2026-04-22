import { describe, it, expect } from 'vitest';
import { computeEurMetrics, applyRateToHolding } from '../utils/eurMetrics';
import type { PricedPortfolioStatus, PricedHolding } from '../api';

const baseStatus: PricedPortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test',
  current_value: 10500,
  principal: 10000,
  principal_eur: 9000,  // deposited at fx_rate 1.1111
  principal_eur_avg: 9000,
  dividends: 0,
  dividends_eur: null,
  cash: 9000,
  holdings: [],
  holdings_cost: 1000,
  holdings_value: 1500,
  unrealized_gains: 500,
  unrealized_gains_pct: 50,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0.255,
  missing_prices: [],
  warnings: [],
  usd_to_eur_rate: 0.85,
};

describe('computeEurMetrics', () => {
  it('returns null when usd_to_eur_rate is null', () => {
    const status = { ...baseStatus, usd_to_eur_rate: null };
    expect(computeEurMetrics(status)).toBeNull();
  });

  it('computes currentValueEur correctly', () => {
    const result = computeEurMetrics(baseStatus)!;
    expect(result.currentValueEur).toBeCloseTo(10500 * 0.85);  // 8925
  });

  it('computes unrealizedGainsEur correctly', () => {
    const result = computeEurMetrics(baseStatus)!;
    expect(result.unrealizedGainsEur).toBeCloseTo(500 * 0.85);  // 425
  });

  it('computes currencyGainsEur correctly', () => {
    // principal * rate - principal_eur = 10000 * 0.85 - 9000 = -500
    const result = computeEurMetrics(baseStatus)!;
    expect(result.currencyGainsEur).toBeCloseTo(-500);
  });

  it('computes currencyGainsPct correctly', () => {
    // -500 / 9000 * 100 ≈ -5.556%
    const result = computeEurMetrics(baseStatus)!;
    expect(result.currencyGainsPct).toBeCloseTo(-500 / 9000 * 100);
  });

  it('computes tax with no dividends', () => {
    // currentValueEur=8925, principal_eur=9000, capitalGains=-75 → taxEur=0
    const result = computeEurMetrics(baseStatus)!;
    expect(result.capitalGainsEur).toBeCloseTo(-75);
    expect(result.taxEur).toBe(0);
  });

  it('computes tax with positive capital gains', () => {
    const status: PricedPortfolioStatus = {
      ...baseStatus,
      current_value: 20000,
      principal: 10000,
      principal_eur: 10000,
      cash: 0,
      usd_to_eur_rate: 1.0,
    };
    const result = computeEurMetrics(status)!;
    // capitalGainsEur = 20000 - 10000 - 0 = 10000
    expect(result.capitalGainsEur).toBeCloseTo(10000);
    // taxEur = 10000 * 0.255 = 2550
    expect(result.taxEur).toBeCloseTo(2550);
    // totalReturnAfterTaxEur = (20000 - 10000) - 2550 = 7450
    expect(result.totalReturnAfterTaxEur).toBeCloseTo(7450);
    // totalReturnAfterTaxPct = 7450 / 10000 * 100 = 74.5
    expect(result.totalReturnAfterTaxPct).toBeCloseTo(74.5);
    // currentValueAfterTaxEur = 20000 - 2550 = 17450
    expect(result.currentValueAfterTaxEur).toBeCloseTo(17450);
  });

  it('excludes dividends from capital gains', () => {
    const status: PricedPortfolioStatus = {
      ...baseStatus,
      current_value: 17000,
      principal: 10000,
      principal_eur: 10000,
      dividends: 2000,
      dividends_eur: 2000,
      cash: 2000,
      usd_to_eur_rate: 1.0,
    };
    const result = computeEurMetrics(status)!;
    // capitalGainsEur = 17000 - 10000 - 2000 = 5000
    expect(result.capitalGainsEur).toBeCloseTo(5000);
    // taxEur = 5000 * 0.255 = 1275
    expect(result.taxEur).toBeCloseTo(1275);
  });

  it('skips tax when dividends exist but dividends_eur is null', () => {
    const status: PricedPortfolioStatus = {
      ...baseStatus,
      dividends: 1000,
      dividends_eur: null,
    };
    const result = computeEurMetrics(status)!;
    expect(result.capitalGainsEur).toBeNull();
    expect(result.taxEur).toBeNull();
    expect(result.totalReturnAfterTaxEur).toBeNull();
    expect(result.currentValueAfterTaxEur).toBeNull();
  });

  it('skips tax when current_value is null (prices not loaded)', () => {
    const status: PricedPortfolioStatus = {
      ...baseStatus,
      current_value: null,
      holdings_value: null,
      unrealized_gains: null,
      unrealized_gains_pct: null,
    };
    const result = computeEurMetrics(status)!;
    expect(result.currentValueEur).toBeNull();
    expect(result.unrealizedGainsEur).toBeNull();
    expect(result.capitalGainsEur).toBeNull();
    expect(result.taxEur).toBeNull();
    expect(result.totalReturnAfterTaxEur).toBeNull();
    expect(result.currentValueAfterTaxEur).toBeNull();
    // Non-price-dependent fields still computed
    expect(result.currencyGainsEur).toBeCloseTo(-500);
    expect(result.cashEur).toBeCloseTo(9000 * 0.85);
  });

  it('returns null unrealizedGainsEur when unrealized_gains is null', () => {
    const status: PricedPortfolioStatus = {
      ...baseStatus,
      unrealized_gains: null,
      unrealized_gains_pct: null,
    };
    const result = computeEurMetrics(status)!;
    expect(result.unrealizedGainsEur).toBeNull();
    // current_value still present, so currentValueEur should be computed
    expect(result.currentValueEur).toBeCloseTo(10500 * 0.85);
  });

  it('returns currencyGainsPct as null when principal_eur_avg is 0', () => {
    const status = { ...baseStatus, principal_eur: 0, principal_eur_avg: 0 };
    const result = computeEurMetrics(status)!;
    expect(result.currencyGainsPct).toBeNull();
  });

  it('computes cashEur correctly', () => {
    const result = computeEurMetrics(baseStatus)!;
    expect(result.cashEur).toBeCloseTo(9000 * 0.85);
  });

  it('returns non-null result when rate is present', () => {
    const result = computeEurMetrics(baseStatus);
    expect(result).not.toBeNull();
    expect(result!.rate).toBe(0.85);
  });
});

describe('applyRateToHolding', () => {
  const holding: PricedHolding = {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
    first_buy_date: '2024-01-01',
    current_price: 200,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    price_source: 'live',
    price_as_of: null,
  };

  it('converts all fields correctly', () => {
    const result = applyRateToHolding(holding, 0.92);
    expect(result.averageCostEur).toBeCloseTo(150 * 0.92);
    expect(result.totalCostEur).toBeCloseTo(1500 * 0.92);
    expect(result.currentPriceEur).toBeCloseTo(200 * 0.92);
    expect(result.currentValueEur).toBeCloseTo(2000 * 0.92);
    expect(result.unrealizedGainLossEur).toBeCloseTo(500 * 0.92);
  });

  it('returns null for optional fields when source is null', () => {
    const holdingNoPrice: PricedHolding = {
      ...holding,
      current_price: null,
      current_value: null,
      unrealized_gain_loss: null,
    };
    const result = applyRateToHolding(holdingNoPrice, 0.92);
    expect(result.currentPriceEur).toBeNull();
    expect(result.currentValueEur).toBeNull();
    expect(result.unrealizedGainLossEur).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { computePricedStatus } from '../utils/computePricedStatus';
import type { PortfolioStatus, LivePrices } from '../api';

const makeStatus = (overrides: Partial<PortfolioStatus> = {}): PortfolioStatus => ({
  portfolio_id: 1,
  portfolio_name: 'Test',
  principal: 8_000,
  principal_eur: 7_200,
  dividends: 100,
  dividends_eur: 90,
  cash: 1_000,
  holdings: [
    { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1_500, first_buy_date: '2024-01-01' },
    { ticker: 'MSFT', quantity: 20, average_cost: 400, total_cost: 8_000, first_buy_date: '2024-01-01' },
  ],
  holdings_cost: 9_500,
  realized_gains: 200,
  realized_sales: [],
  dividends_received: [],
  capital_gains_tax_rate: 0.25,
  warnings: [],
  usd_to_eur_rate: 0.90,
  ...overrides,
});

const makeLivePrices = (overrides: Partial<LivePrices> = {}): LivePrices => ({
  prices: { AAPL: 210, MSFT: 420 },
  usd_to_eur_rate: 0.91,
  timestamp: '2026-03-03T12:00:00Z',
  ...overrides,
});

describe('computePricedStatus', () => {
  it('computes holding prices and derived fields from live prices', () => {
    const result = computePricedStatus(makeStatus(), makeLivePrices());

    // AAPL: 210 * 10 = 2100
    const aapl = result.holdings.find((h) => h.ticker === 'AAPL')!;
    expect(aapl.current_price).toBe(210);
    expect(aapl.current_value).toBe(2_100);
    expect(aapl.unrealized_gain_loss).toBe(600); // 2100 - 1500
    expect(aapl.unrealized_gain_loss_pct).toBeCloseTo(40, 0); // 600/1500*100

    // MSFT: 420 * 20 = 8400
    const msft = result.holdings.find((h) => h.ticker === 'MSFT')!;
    expect(msft.current_price).toBe(420);
    expect(msft.current_value).toBe(8_400);
    expect(msft.unrealized_gain_loss).toBe(400); // 8400 - 8000
  });

  it('computes portfolio-level values', () => {
    const result = computePricedStatus(makeStatus(), makeLivePrices());

    // holdings_value = 2100 + 8400 = 10500
    expect(result.holdings_value).toBe(10_500);
    // current_value = cash(1000) + 10500 = 11500
    expect(result.current_value).toBe(11_500);
    // unrealized = 10500 - 9500 = 1000
    expect(result.unrealized_gains).toBe(1_000);
    expect(result.unrealized_gains_pct).toBeCloseTo((1_000 / 9_500) * 100, 1);
  });

  it('prefers live usd_to_eur_rate', () => {
    const result = computePricedStatus(makeStatus(), makeLivePrices());
    expect(result.usd_to_eur_rate).toBe(0.91);
  });

  it('falls back to status FX rate when live rate is null', () => {
    const live = makeLivePrices({ usd_to_eur_rate: null });
    const result = computePricedStatus(makeStatus(), live);
    expect(result.usd_to_eur_rate).toBe(0.90);
  });

  it('returns null price fields when live prices map is empty (not yet loaded)', () => {
    const live: LivePrices = { prices: {}, usd_to_eur_rate: null, timestamp: '' };
    const result = computePricedStatus(makeStatus(), live);

    expect(result.current_value).toBeNull();
    expect(result.holdings_value).toBeNull();
    expect(result.unrealized_gains).toBeNull();
    expect(result.unrealized_gains_pct).toBeNull();
    expect(result.missing_prices).toEqual([]);

    for (const h of result.holdings) {
      expect(h.current_price).toBeNull();
      expect(h.current_value).toBeNull();
      expect(h.unrealized_gain_loss).toBeNull();
      expect(h.unrealized_gain_loss_pct).toBeNull();
    }
  });

  it('adds ticker to missing_prices when live price is explicitly null', () => {
    const live = makeLivePrices({ prices: { AAPL: 210, MSFT: null } });
    const result = computePricedStatus(makeStatus(), live);

    expect(result.missing_prices).toEqual(['MSFT']);

    const msft = result.holdings.find((h) => h.ticker === 'MSFT')!;
    expect(msft.current_price).toBeNull();
    expect(msft.current_value).toBeNull();

    // AAPL should still be priced
    const aapl = result.holdings.find((h) => h.ticker === 'AAPL')!;
    expect(aapl.current_price).toBe(210);
  });

  it('does not mutate the original status', () => {
    const status = makeStatus();
    const originalHoldings = [...status.holdings];
    computePricedStatus(status, makeLivePrices());

    expect(status.holdings).toEqual(originalHoldings);
  });

  it('returns null unrealized_gain_loss_pct when total_cost is 0', () => {
    const status = makeStatus({
      holdings: [{ ticker: 'FREE', quantity: 5, average_cost: 0, total_cost: 0, first_buy_date: '2024-01-01' }],
      holdings_cost: 0,
    });
    const result = computePricedStatus(status, makeLivePrices({ prices: { FREE: 10 } }));

    const free = result.holdings.find((h) => h.ticker === 'FREE')!;
    expect(free.current_value).toBe(50);
    expect(free.unrealized_gain_loss).toBe(50);
    expect(free.unrealized_gain_loss_pct).toBeNull();
  });

  it('returns null unrealized_gains_pct when holdings_cost is 0', () => {
    const status = makeStatus({
      holdings: [{ ticker: 'FREE', quantity: 5, average_cost: 0, total_cost: 0, first_buy_date: '2024-01-01' }],
      holdings_cost: 0,
    });
    const result = computePricedStatus(status, makeLivePrices({ prices: { FREE: 10 } }));

    expect(result.unrealized_gains_pct).toBeNull();
    expect(result.unrealized_gains).toBe(50); // 50 - 0
  });

  it('preserves transaction-derived fields', () => {
    const status = makeStatus();
    const result = computePricedStatus(status, makeLivePrices());

    expect(result.cash).toBe(status.cash);
    expect(result.principal).toBe(status.principal);
    expect(result.principal_eur).toBe(status.principal_eur);
    expect(result.dividends).toBe(status.dividends);
    expect(result.dividends_eur).toBe(status.dividends_eur);
    expect(result.realized_gains).toBe(status.realized_gains);
    expect(result.capital_gains_tax_rate).toBe(status.capital_gains_tax_rate);
    expect(result.holdings_cost).toBe(status.holdings_cost);
    expect(result.warnings).toBe(status.warnings);
  });
});

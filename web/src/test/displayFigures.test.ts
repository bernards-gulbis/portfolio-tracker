import { describe, it, expect } from 'vitest';
import { computeDisplayFigures } from '../components/portfolio-status/displayFigures';
import type { PricedPortfolioStatus } from '../api';
import type { EurMetrics } from '../utils/eurMetrics';

const baseStatus: PricedPortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test',
  current_value: 12000,
  principal: 10000,
  principal_eur: 9000,
  principal_eur_avg: 9000,
  dividends: 0,
  dividends_eur: null,
  cash: 0,
  holdings: [],
  holdings_cost: 10000,
  holdings_value: 12000,
  unrealized_gains: 2000,
  unrealized_gains_pct: 20,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0.2,
  missing_prices: [],
  warnings: [],
  usd_to_eur_rate: 0.9,
  eur_incomplete: false,
  fx_missing_tx_ids: [],
  transaction_count: 0,
};

const baseEur: EurMetrics = {
  rate: 0.9,
  currentValueEur: 10800,
  unrealizedGainsEur: 1800,
  currencyGainsEur: 0,
  currencyGainsPct: 0,
  capitalGainsEur: 1800,
  taxEur: 360,
  totalReturnAfterTaxEur: 1440,
  totalReturnAfterTaxPct: 16,
  currentValueAfterTaxEur: 10440,
  cashEur: 0,
};

describe('computeDisplayFigures', () => {
  describe('USD mode', () => {
    it('uses raw USD figures from status', () => {
      const f = computeDisplayFigures(baseStatus, baseEur, 'USD');
      expect(f.totalValue).toBe(12000);
      expect(f.netInvested).toBe(10000);
      expect(f.totalReturn).toBe(2000);
    });

    it('computes tax from gains (current - principal - dividends) × rate', () => {
      // (12000 − 10000 − 0) × 0.2 = 400
      const f = computeDisplayFigures(baseStatus, baseEur, 'USD');
      expect(f.estimatedTax).toBe(400);
      expect(f.afterTaxValue).toBe(11600);
    });

    it('returns zero tax when capital gains are negative', () => {
      const status = { ...baseStatus, current_value: 8000 };
      const f = computeDisplayFigures(status, baseEur, 'USD');
      expect(f.estimatedTax).toBe(0);
      expect(f.afterTaxValue).toBe(8000);
    });

    it('subtracts dividends from taxable gains', () => {
      const status = { ...baseStatus, dividends: 500 };
      // (12000 − 10000 − 500) × 0.2 = 300
      const f = computeDisplayFigures(status, baseEur, 'USD');
      expect(f.estimatedTax).toBe(300);
    });

    it('does not populate fxImpact in USD mode', () => {
      const f = computeDisplayFigures(baseStatus, baseEur, 'USD');
      expect(f.fxImpact).toBeNull();
      expect(f.fxImpactPct).toBeNull();
    });

    it('returns null totalReturn when current_value is null', () => {
      const status = { ...baseStatus, current_value: null };
      const f = computeDisplayFigures(status, baseEur, 'USD');
      expect(f.totalValue).toBeNull();
      expect(f.totalReturn).toBeNull();
      expect(f.estimatedTax).toBeNull();
      expect(f.afterTaxValue).toBeNull();
    });
  });

  describe('EUR mode', () => {
    it('uses EUR-converted figures', () => {
      const f = computeDisplayFigures(baseStatus, baseEur, 'EUR');
      expect(f.totalValue).toBe(10800);
      expect(f.netInvested).toBe(9000);
      expect(f.totalReturn).toBe(1800);
    });

    it('takes tax directly from eur metrics (no recomputation)', () => {
      const f = computeDisplayFigures(baseStatus, baseEur, 'EUR');
      expect(f.estimatedTax).toBe(360);
      expect(f.afterTaxValue).toBe(10440);
    });

    it('populates fxImpact from eur.currencyGainsEur', () => {
      const eur = { ...baseEur, currencyGainsEur: -250, currencyGainsPct: -2.5 };
      const f = computeDisplayFigures(baseStatus, eur, 'EUR');
      expect(f.fxImpact).toBe(-250);
      expect(f.fxImpactPct).toBe(-2.5);
    });

    it('returns null tax when eur metrics is null (rate unavailable)', () => {
      const f = computeDisplayFigures(baseStatus, null, 'EUR');
      expect(f.totalValue).toBeNull();
      expect(f.estimatedTax).toBeNull();
      expect(f.afterTaxValue).toBeNull();
      expect(f.fxImpact).toBeNull();
    });

    it('returns null tax when eur.taxEur is null (incomplete EUR aggregates)', () => {
      const eur = { ...baseEur, taxEur: null };
      const f = computeDisplayFigures(baseStatus, eur, 'EUR');
      expect(f.estimatedTax).toBeNull();
      expect(f.afterTaxValue).toBeNull();
    });

    it('returns null totalReturn when principal_eur is null', () => {
      const status = { ...baseStatus, principal_eur: null };
      const f = computeDisplayFigures(status, baseEur, 'EUR');
      expect(f.netInvested).toBeNull();
      expect(f.totalReturn).toBeNull();
    });

    it('returns null currentValueEur when eur.currentValueEur is null', () => {
      const eur = { ...baseEur, currentValueEur: null };
      const f = computeDisplayFigures(baseStatus, eur, 'EUR');
      expect(f.totalValue).toBeNull();
      expect(f.totalReturn).toBeNull();
    });
  });
});

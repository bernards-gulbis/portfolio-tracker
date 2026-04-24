import { beforeEach, describe, expect, it, vi } from 'vitest';

import apiInstance, {
  getPortfolioStatus,
  getPortfolios,
  getLivePrices,
  getPortfolioPerformance,
} from '../api';
import { ApiContractError, isApiContractError, parseOrThrow } from '../api-error';
import { z } from 'zod';

describe('parseOrThrow', () => {
  it('returns the parsed value when data matches the schema', () => {
    const schema = z.object({ ok: z.boolean() });
    const parsed = parseOrThrow(schema, { ok: true }, 'GET /noop');
    expect(parsed).toEqual({ ok: true });
  });

  it('throws ApiContractError with the endpoint when data does not match', () => {
    const schema = z.object({ ok: z.boolean() });
    expect(() => parseOrThrow(schema, { ok: 'yes' }, 'GET /noop')).toThrowError(
      ApiContractError,
    );
    try {
      parseOrThrow(schema, { ok: 'yes' }, 'GET /noop');
    } catch (e) {
      expect(isApiContractError(e)).toBe(true);
      if (isApiContractError(e)) {
        expect(e.endpoint).toBe('GET /noop');
        expect(e.issues.length).toBeGreaterThan(0);
        expect(e.issues[0].path).toBe('ok');
      }
    }
  });

  it('reports every issue when multiple fields violate the schema', () => {
    const schema = z.object({ a: z.number(), b: z.string() });
    try {
      parseOrThrow(schema, { a: 'not-a-number', b: 42 }, 'POST /thing');
    } catch (e) {
      if (!isApiContractError(e)) throw e;
      const paths = e.issues.map((i) => i.path).sort();
      expect(paths).toEqual(['a', 'b']);
    }
  });
});

describe('API fetch sites enforce the response contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPortfolios throws ApiContractError when backend returns the wrong shape', async () => {
    // Backend drift: returns an object instead of an array.
    vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: { not: 'an array' } });
    await expect(getPortfolios()).rejects.toThrow(ApiContractError);
  });

  it('getPortfolioStatus throws ApiContractError when a required field is missing', async () => {
    // Simulate the specific drift called out in the plan: usd_to_eur_rate
    // renamed to usdToEurRate (camelCase). The schema must catch this.
    const driftedPayload = {
      portfolio_id: 1,
      portfolio_name: 'P',
      principal: 0,
      principal_eur: 0,
      principal_eur_avg: 0,
      dividends: 0,
      dividends_eur: null,
      cash: 0,
      holdings: [],
      holdings_cost: 0,
      realized_gains: 0,
      realized_sales: [],
      dividends_received: [],
      realized_withdrawals: [],
      capital_gains_tax_rate: 0.25,
      warnings: [],
      usdToEurRate: 0.9, // ← renamed from usd_to_eur_rate
    };
    vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: driftedPayload });
    try {
      await getPortfolioStatus(1);
      throw new Error('expected ApiContractError');
    } catch (e) {
      if (!isApiContractError(e)) throw e;
      expect(e.endpoint).toBe('GET /portfolios/1/status');
      expect(e.issues.some((i) => i.path === 'usd_to_eur_rate')).toBe(true);
    }
  });

  it('getLivePrices throws ApiContractError when a nested source value is unexpected', async () => {
    // Drift: backend returns a 4th source value we haven't enumerated.
    const driftedPayload = {
      prices: { AAPL: { price: 200, source: 'delayed', as_of: '2026-01-01T12:00:00Z' } },
      usd_to_eur_rate: 0.9,
      timestamp: '2026-01-01T12:00:00Z',
    };
    vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: driftedPayload });
    await expect(getLivePrices(['AAPL'])).rejects.toThrow(ApiContractError);
  });

  it('getPortfolioPerformance accepts responses without cost_basis_fallback_tickers', async () => {
    // The field is `.default([])` on the schema — older backends that don't
    // yet send it must still parse (the default fills it in), otherwise this
    // becomes a deployment-ordering hazard.
    const payload = {
      portfolio_id: 1,
      portfolio_name: 'P',
      data_points: [],
    };
    vi.spyOn(apiInstance, 'get').mockResolvedValueOnce({ data: payload });
    const result = await getPortfolioPerformance(1);
    expect(result.cost_basis_fallback_tickers).toEqual([]);
  });
});

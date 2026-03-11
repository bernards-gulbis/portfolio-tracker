import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGainsTableData, useDividendsTableData } from '../hooks/useRealizedGainsData';
import type { RealizedSale, DividendReceived } from '../api';

const makeSale = (overrides: Partial<RealizedSale> = {}): RealizedSale => ({
  ticker: 'AAPL',
  date: '2025-06-15T10:00:00',
  quantity: 10,
  quantity_before: 10,
  proceeds: 2000,
  cost_basis: 1500,
  realized_gain: 500,
  first_buy_date: '2024-01-01T00:00:00',
  ...overrides,
});

const makeDividend = (overrides: Partial<DividendReceived> = {}): DividendReceived => ({
  ticker: 'MSFT',
  date: '2025-06-15T10:00:00',
  amount: 100,
  amount_eur: 92,
  ...overrides,
});

describe('useGainsTableData', () => {
  it('groups sales by ticker', () => {
    const sales = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00', realized_gain: 300 }),
      makeSale({ ticker: 'MSFT', realized_gain: 100 }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    expect(result.current.filteredGains).toHaveLength(2);
    const aaplGroup = result.current.filteredGains.find(g => g.ticker === 'AAPL');
    expect(aaplGroup?.totalGain).toBe(500);
    expect(aaplGroup?.sales).toHaveLength(2);
  });

  it('returns correct totals', () => {
    const sales = [
      makeSale({ realized_gain: 200 }),
      makeSale({ ticker: 'MSFT', realized_gain: 300 }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    expect(result.current.gainsTotals.gain).toBe(500);
    expect(result.current.gainsTotals.count).toBe(2);
  });

  it('filters by ticker', () => {
    const sales = [
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'MSFT' }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    act(() => {
      result.current.handleFilterChange('AAPL');
    });
    expect(result.current.filteredGains).toHaveLength(1);
    expect(result.current.filteredGains[0].ticker).toBe('AAPL');
  });

  it('filters by year', () => {
    const sales = [
      makeSale({ ticker: 'AAPL', date: '2025-06-15T10:00:00' }),
      makeSale({ ticker: 'MSFT', date: '2024-03-10T10:00:00' }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    act(() => {
      result.current.handleYearChange('2024');
    });
    expect(result.current.filteredGains).toHaveLength(1);
    expect(result.current.filteredGains[0].ticker).toBe('MSFT');
  });

  it('sorts by gain', () => {
    const sales = [
      makeSale({ ticker: 'AAPL', realized_gain: 100 }),
      makeSale({ ticker: 'MSFT', realized_gain: 500 }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    // Default sort is date desc, click gain to sort desc
    act(() => {
      result.current.handleSort('gain');
    });
    // First group should be MSFT (higher gain, descending)
    expect(result.current.filteredGains[0].ticker).toBe('MSFT');

    // Click again to sort ascending
    act(() => {
      result.current.handleSort('gain');
    });
    expect(result.current.filteredGains[0].ticker).toBe('AAPL');
  });

  it('sorts by count', () => {
    const sales = [
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'MSFT' }),
      makeSale({ ticker: 'MSFT', date: '2025-05-01T10:00:00' }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    act(() => {
      result.current.handleSort('count');
    });
    // MSFT has 2 sales, AAPL has 1 — descending by count
    expect(result.current.filteredGains[0].ticker).toBe('MSFT');
  });

  it('toggles expansion state for a ticker', () => {
    const sales = [makeSale({ ticker: 'AAPL' })];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales }));
    expect(result.current.expandState.has('AAPL')).toBe(false);

    act(() => {
      result.current.toggleExpand('AAPL');
    });
    expect(result.current.expandState.has('AAPL')).toBe(true);

    act(() => {
      result.current.toggleExpand('AAPL');
    });
    expect(result.current.expandState.has('AAPL')).toBe(false);
  });

  it('returns empty results for no sales', () => {
    const { result } = renderHook(() => useGainsTableData({ realizedSales: [] }));
    expect(result.current.filteredGains).toHaveLength(0);
    expect(result.current.gainsTotals.gain).toBe(0);
    expect(result.current.gainsTotals.count).toBe(0);
  });
});

describe('useDividendsTableData', () => {
  it('groups dividends by ticker', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80 }),
      makeDividend({ ticker: 'AAPL', amount: 50 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends }));
    expect(result.current.filteredDividends).toHaveLength(2);
    const msftGroup = result.current.filteredDividends.find(g => g.ticker === 'MSFT');
    expect(msftGroup?.totalAmount).toBe(180);
    expect(msftGroup?.payments).toHaveLength(2);
  });

  it('computes EUR total when all payments have EUR amounts', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80, amount_eur: 74 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends }));
    const msft = result.current.filteredDividends[0];
    expect(msft.totalAmountEur).toBe(166);
  });

  it('returns null EUR total when some payments lack EUR amounts', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80, amount_eur: null }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends }));
    const msft = result.current.filteredDividends[0];
    expect(msft.totalAmountEur).toBeNull();
  });

  it('computes dividendTotals correctly', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: 46 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends }));
    expect(result.current.dividendTotals.totalUsd).toBe(150);
    expect(result.current.dividendTotals.totalEur).toBe(138);
    expect(result.current.dividendTotals.count).toBe(2);
  });

  it('returns null totalEur when some groups lack EUR', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: null }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends }));
    expect(result.current.dividendTotals.totalEur).toBeNull();
  });
});

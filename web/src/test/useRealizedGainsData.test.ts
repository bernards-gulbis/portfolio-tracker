import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGainsTableData, useDividendsTableData } from '../hooks/useRealizedGainsData';
import type { TableViewMode } from '../hooks/useTableViewMode';
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

  it('returns one row per sale in ungrouped view mode', () => {
    const sales = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00', realized_gain: 300 }),
      makeSale({ ticker: 'MSFT', realized_gain: 100 }),
    ];
    const { result } = renderHook(() => useGainsTableData({ realizedSales: sales, viewMode: 'ungrouped' }));
    expect(result.current.filteredGains).toHaveLength(3);
    for (const group of result.current.filteredGains) {
      expect(group.sales).toHaveLength(1);
      expect(group.totalGain).toBe(group.sales[0].realized_gain);
    }
  });

  it('preserves count totals across grouped and ungrouped modes', () => {
    const sales = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00', realized_gain: 300 }),
      makeSale({ ticker: 'MSFT', realized_gain: 100 }),
    ];
    const grouped = renderHook(() => useGainsTableData({ realizedSales: sales, viewMode: 'grouped' }));
    const ungrouped = renderHook(() => useGainsTableData({ realizedSales: sales, viewMode: 'ungrouped' }));

    expect(grouped.result.current.gainsTotals.count).toBe(3);
    expect(ungrouped.result.current.gainsTotals.count).toBe(3);
    expect(grouped.result.current.gainsTotals.gain).toBe(600);
    expect(ungrouped.result.current.gainsTotals.gain).toBe(600);
  });

  it('sorts by ticker alphabetically in ungrouped mode', () => {
    const sales = [
      makeSale({ ticker: 'TSLA' }),
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'MSFT' }),
    ];
    const { result, rerender } = renderHook(
      ({ viewMode }) => useGainsTableData({ realizedSales: sales, viewMode }),
      { initialProps: { viewMode: 'ungrouped' as const } },
    );

    act(() => { result.current.handleSort('ticker'); });
    expect(result.current.filteredGains.map((g) => g.ticker)).toEqual(['AAPL', 'MSFT', 'TSLA']);

    act(() => { result.current.handleSort('ticker'); });
    expect(result.current.filteredGains.map((g) => g.ticker)).toEqual(['TSLA', 'MSFT', 'AAPL']);

    rerender({ viewMode: 'ungrouped' });
  });

  it('resets sort key when switching from grouped (count) to ungrouped', () => {
    const sales = [
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00' }),
      makeSale({ ticker: 'MSFT' }),
    ];
    const { result, rerender } = renderHook(
      ({ viewMode }) => useGainsTableData({ realizedSales: sales, viewMode }),
      { initialProps: { viewMode: 'grouped' as TableViewMode } },
    );

    act(() => { result.current.handleSort('count'); });
    expect(result.current.sortKey).toBe('count');

    rerender({ viewMode: 'ungrouped' });
    expect(result.current.sortKey).toBe('date');
  });

  it('toggles sort direction on the first date click after switching from grouped (count) to ungrouped', () => {
    const sales = [
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00' }),
      makeSale({ ticker: 'MSFT' }),
    ];
    const { result, rerender } = renderHook(
      ({ viewMode }) => useGainsTableData({ realizedSales: sales, viewMode }),
      { initialProps: { viewMode: 'grouped' as TableViewMode } },
    );

    act(() => { result.current.handleSort('count'); });
    expect(result.current.sortAsc).toBe(false);

    rerender({ viewMode: 'ungrouped' });
    expect(result.current.sortKey).toBe('date');
    expect(result.current.sortAsc).toBe(false);

    act(() => { result.current.handleSort('date'); });
    expect(result.current.sortKey).toBe('date');
    expect(result.current.sortAsc).toBe(true);
  });
});

describe('useDividendsTableData', () => {
  it('groups dividends by ticker', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80 }),
      makeDividend({ ticker: 'AAPL', amount: 50 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
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
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    const msft = result.current.filteredDividends[0];
    expect(msft.totalAmountEur).toBe(166);
  });

  it('returns null EUR total when some payments lack EUR amounts', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80, amount_eur: null }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    const msft = result.current.filteredDividends[0];
    expect(msft.totalAmountEur).toBeNull();
  });

  it('computes dividendTotals correctly', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: 46 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    expect(result.current.dividendTotals.totalUsd).toBe(150);
    expect(result.current.dividendTotals.totalEur).toBe(138);
    expect(result.current.dividendTotals.count).toBe(2);
  });

  it('sorts by amount in EUR mode (EUR when available, USD otherwise)', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: 46 }),
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'TSLA', amount: 200, amount_eur: null }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    // Sort by amount descending (default after clicking 'amount')
    act(() => {
      result.current.handleSort('amount');
    });
    // TSLA uses USD amount (200), MSFT has EUR 92, AAPL has EUR 46
    // Sorting: TSLA(200) > MSFT(92) > AAPL(46)
    expect(result.current.filteredDividends[0].ticker).toBe('TSLA');
    expect(result.current.filteredDividends[1].ticker).toBe('MSFT');
    expect(result.current.filteredDividends[2].ticker).toBe('AAPL');
  });

  // Regression: previously, sortDividendGroups used (totalAmountEur ?? totalAmount)
  // regardless of displayCurrency, so a USD-displayed table could sort by EUR
  // values whose ratio to USD differed across rows, producing visible misorder.
  it('sorts by USD amount in USD mode even when EUR is available', () => {
    // Dates intentionally span periods where the historical USD/EUR rate
    // differs enough that sorting by EUR vs USD gives different orderings.
    const dividends = [
      makeDividend({ ticker: 'AAPL', amount: 100, amount_eur: 110 }), // weak USD: 1 USD = 1.1 EUR
      makeDividend({ ticker: 'MSFT', amount: 105, amount_eur: 90 }), // strong USD: 1 USD = ~0.86 EUR
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'USD' }));
    act(() => {
      result.current.handleSort('amount');
    });
    // By USD amount desc: MSFT(105) > AAPL(100). The old code would have used
    // EUR (110 > 90), producing AAPL > MSFT, which contradicts the rendered USD.
    expect(result.current.filteredDividends[0].ticker).toBe('MSFT');
    expect(result.current.filteredDividends[1].ticker).toBe('AAPL');
  });

  it('returns null totalEur when some groups lack EUR', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: null }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    expect(result.current.dividendTotals.totalEur).toBeNull();
  });

  it('sorts dividends by date descending by default', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL', date: '2025-01-01T10:00:00' }),
      makeDividend({ ticker: 'MSFT', date: '2025-06-01T10:00:00' }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    // Default sort is 'date' descending — MSFT (Jun) should come first
    expect(result.current.filteredDividends[0].ticker).toBe('MSFT');
  });

  it('sorts dividends by date ascending when toggled', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL', date: '2025-01-01T10:00:00' }),
      makeDividend({ ticker: 'MSFT', date: '2025-06-01T10:00:00' }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    // Default is 'date' descending. First click on 'date' toggles to ascending.
    act(() => {
      result.current.handleSort('date');
    });
    // Now ascending — AAPL (Jan) should come first
    expect(result.current.filteredDividends[0].ticker).toBe('AAPL');
  });

  it('sorts dividends by count', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL', amount: 50 }),
      makeDividend({ ticker: 'MSFT', amount: 100 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    act(() => {
      result.current.handleSort('count');
    });
    // MSFT has 2 payments, AAPL has 1 — descending by count
    expect(result.current.filteredDividends[0].ticker).toBe('MSFT');
  });

  it('sorts amount ascending when toggled twice', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL', amount: 50, amount_eur: 46 }),
      makeDividend({ ticker: 'MSFT', amount: 100, amount_eur: 92 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, displayCurrency: 'EUR' }));
    act(() => { result.current.handleSort('amount'); });
    // Descending: MSFT first
    expect(result.current.filteredDividends[0].ticker).toBe('MSFT');
    act(() => { result.current.handleSort('amount'); });
    // Ascending: AAPL first
    expect(result.current.filteredDividends[0].ticker).toBe('AAPL');
  });

  it('returns one row per payment in ungrouped view mode', () => {
    const dividends = [
      makeDividend({ ticker: 'MSFT', amount: 100 }),
      makeDividend({ ticker: 'MSFT', date: '2025-05-01T10:00:00', amount: 80 }),
      makeDividend({ ticker: 'AAPL', amount: 50 }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, viewMode: 'ungrouped', displayCurrency: 'EUR' }));
    expect(result.current.filteredDividends).toHaveLength(3);
    for (const group of result.current.filteredDividends) {
      expect(group.payments).toHaveLength(1);
      expect(group.totalAmount).toBe(group.payments[0].amount);
    }
  });

  it('sorts ungrouped dividends by ticker alphabetically', () => {
    const dividends = [
      makeDividend({ ticker: 'TSLA' }),
      makeDividend({ ticker: 'AAPL' }),
      makeDividend({ ticker: 'MSFT' }),
    ];
    const { result } = renderHook(() => useDividendsTableData({ dividendsReceived: dividends, viewMode: 'ungrouped', displayCurrency: 'EUR' }));
    act(() => { result.current.handleSort('ticker'); });
    expect(result.current.filteredDividends.map((g) => g.ticker)).toEqual(['AAPL', 'MSFT', 'TSLA']);
  });

  it('resets dividend sort key when switching from grouped (count) to ungrouped', () => {
    const dividends = [
      makeDividend({ ticker: 'AAPL' }),
      makeDividend({ ticker: 'MSFT' }),
    ];
    const { result, rerender } = renderHook(
      ({ viewMode }) => useDividendsTableData({ dividendsReceived: dividends, viewMode, displayCurrency: 'EUR' }),
      { initialProps: { viewMode: 'grouped' as TableViewMode } },
    );

    act(() => { result.current.handleSort('count'); });
    expect(result.current.sortKey).toBe('count');

    rerender({ viewMode: 'ungrouped' });
    expect(result.current.sortKey).toBe('date');
  });
});

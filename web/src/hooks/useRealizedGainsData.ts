import { useCallback, useMemo, useState } from 'react';
import type { RealizedSale, DividendReceived } from '../api';
import type { TableViewMode } from './useTableViewMode';

export interface TickerGroup {
  ticker: string;
  sales: RealizedSale[];
  totalGain: number;
}

export interface DividendTickerGroup {
  ticker: string;
  payments: DividendReceived[];
  totalAmount: number;
  totalAmountEur: number | null;
}

/** Picks the same numeric value the dividend table renders for a given
 *  ``displayCurrency``. Used by ``sortDividendGroups`` and the formatter so
 *  the sort key and the rendered amount can never drift apart. */
export const dividendDisplayValue = (
  amountUsd: number,
  amountEur: number | null,
  displayCurrency: 'EUR' | 'USD',
): { amount: number; currency: 'EUR' | 'USD' } =>
  displayCurrency === 'EUR' && amountEur != null
    ? { amount: amountEur, currency: 'EUR' }
    : { amount: amountUsd, currency: 'USD' };

const PAGE_SIZE = 10;

function groupByTicker<T extends { ticker: string; date: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.ticker);
    if (list) {
      list.push(item);
    } else {
      map.set(item.ticker, [item]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date));
  }
  return map;
}

interface UseGroupedTableDataArgs<TItem extends { date: string }, TGroup extends { ticker: string }> {
  items: TItem[];
  buildGroups: (filtered: TItem[]) => TGroup[];
  sortFn: (groups: TGroup[], sortKey: string, sortAsc: boolean) => TGroup[];
  validSortKeys: ReadonlySet<string>;
  ascOnSelect?: (key: string) => boolean;
}

function useGroupedTableData<TItem extends { date: string }, TGroup extends { ticker: string }>({
  items,
  buildGroups,
  sortFn,
  validSortKeys,
  ascOnSelect,
}: UseGroupedTableDataArgs<TItem, TGroup>) {
  const [expandState, setExpandState] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [prevValidKeys, setPrevValidKeys] = useState(validSortKeys);

  // Render-phase reset when the sort-key vocabulary changes (e.g. view-mode flip).
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  if (prevValidKeys !== validSortKeys) {
    setPrevValidKeys(validSortKeys);
    if (!validSortKeys.has(sortKey)) {
      setSortKey('date');
      setSortAsc(false);
      setPage(1);
    }
  }

  const availableYears = useMemo(() => {
    const years = new Set(items.map((s) => s.date.slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const yearFiltered = useMemo(() => {
    if (yearFilter === 'all') return items;
    return items.filter((s) => s.date.startsWith(yearFilter));
  }, [items, yearFilter]);

  const groups = useMemo(() => buildGroups(yearFiltered), [buildGroups, yearFiltered]);

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const list = q ? groups.filter((g) => g.ticker.includes(q)) : groups;
    return sortFn(list, sortKey, sortAsc);
  }, [groups, filter, sortKey, sortAsc, sortFn]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = filteredGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleYearChange = (value: string) => {
    setYearFilter(value);
    setPage(1);
  };

  const handleFilterChange = (value: string) => {
    setFilter(value);
    setPage(1);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(ascOnSelect?.(key) ?? false);
    }
    setPage(1);
  };

  const toggleExpand = (ticker: string) => {
    setExpandState((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  };

  return {
    expandState,
    sortKey,
    sortAsc,
    filter,
    yearFilter,
    availableYears,
    filteredGroups,
    pagedGroups,
    safePage,
    totalPages,
    setPage,
    handleYearChange,
    handleFilterChange,
    handleSort,
    toggleExpand,
  };
}

interface UseGainsTableDataArgs {
  realizedSales: RealizedSale[];
  viewMode?: TableViewMode;
}

const buildGainGroups = (filtered: RealizedSale[]): TickerGroup[] => {
  const map = groupByTicker(filtered);
  const result: TickerGroup[] = [];
  for (const [ticker, sales] of map) {
    result.push({
      ticker,
      sales,
      totalGain: sales.reduce((sum, s) => sum + s.realized_gain, 0),
    });
  }
  return result;
};

const buildGainGroupsFlat = (filtered: RealizedSale[]): TickerGroup[] =>
  filtered.map((sale) => ({
    ticker: sale.ticker,
    sales: [sale],
    totalGain: sale.realized_gain,
  }));

const sortGainGroups = (groups: TickerGroup[], sortKey: string, sortAsc: boolean): TickerGroup[] =>
  [...groups].sort((a, b) => {
    let diff: number;
    if (sortKey === 'ticker') {
      diff = a.ticker.localeCompare(b.ticker);
    } else if (sortKey === 'count') {
      diff = a.sales.length - b.sales.length;
    } else if (sortKey === 'gain') {
      diff = a.totalGain - b.totalGain;
    } else {
      diff = a.sales[0].date.localeCompare(b.sales[0].date);
    }
    return sortAsc ? diff : -diff;
  });

const GAIN_GROUPED_KEYS: ReadonlySet<string> = new Set(['date', 'count', 'gain']);
const GAIN_FLAT_KEYS: ReadonlySet<string> = new Set(['date', 'ticker', 'gain']);
const ascOnTickerSelect = (key: string) => key === 'ticker';

export function useGainsTableData({ realizedSales, viewMode = 'grouped' }: UseGainsTableDataArgs) {
  const isGrouped = viewMode === 'grouped';
  const buildGroups = isGrouped ? buildGainGroups : buildGainGroupsFlat;
  const validSortKeys = isGrouped ? GAIN_GROUPED_KEYS : GAIN_FLAT_KEYS;

  const {
    filteredGroups: filteredGains,
    pagedGroups: pagedGains,
    ...rest
  } = useGroupedTableData({
    items: realizedSales,
    buildGroups,
    sortFn: sortGainGroups,
    validSortKeys,
    ascOnSelect: ascOnTickerSelect,
  });

  const gainsTotals = useMemo(() => ({
    gain: filteredGains.reduce((sum, g) => sum + g.totalGain, 0),
    count: filteredGains.reduce((sum, g) => sum + g.sales.length, 0),
  }), [filteredGains]);

  return {
    ...rest,
    filteredGains,
    pagedGains,
    gainsTotals,
  };
}

interface UseDividendsTableDataArgs {
  dividendsReceived: DividendReceived[];
  viewMode?: TableViewMode;
  displayCurrency: 'EUR' | 'USD';
}

const buildDividendGroups = (filtered: DividendReceived[]): DividendTickerGroup[] => {
  const map = groupByTicker(filtered);
  const result: DividendTickerGroup[] = [];
  for (const [ticker, payments] of map) {
    const allHaveEur = payments.every((p) => p.amount_eur != null);
    result.push({
      ticker,
      payments,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      totalAmountEur: allHaveEur
        ? payments.reduce((sum, p) => sum + (p.amount_eur ?? 0), 0)
        : null,
    });
  }
  return result;
};

const buildDividendGroupsFlat = (filtered: DividendReceived[]): DividendTickerGroup[] =>
  filtered.map((p) => ({
    ticker: p.ticker,
    payments: [p],
    totalAmount: p.amount,
    totalAmountEur: p.amount_eur,
  }));

// Sort by the same numeric basis the table renders. ``displayCurrency='USD'``
// with EUR-bearing rows used to sort by raw EUR while displaying USD, which
// produced visible misordering when historical FX rates differed across rows.
const sortDividendGroups = (
  groups: DividendTickerGroup[],
  sortKey: string,
  sortAsc: boolean,
  displayCurrency: 'EUR' | 'USD',
): DividendTickerGroup[] =>
  [...groups].sort((a, b) => {
    let diff: number;
    if (sortKey === 'ticker') {
      diff = a.ticker.localeCompare(b.ticker);
    } else if (sortKey === 'count') {
      diff = a.payments.length - b.payments.length;
    } else if (sortKey === 'amount') {
      const aValue = dividendDisplayValue(a.totalAmount, a.totalAmountEur, displayCurrency).amount;
      const bValue = dividendDisplayValue(b.totalAmount, b.totalAmountEur, displayCurrency).amount;
      diff = aValue - bValue;
    } else {
      diff = a.payments[0].date.localeCompare(b.payments[0].date);
    }
    return sortAsc ? diff : -diff;
  });

const DIVIDEND_GROUPED_KEYS: ReadonlySet<string> = new Set(['date', 'count', 'amount']);
const DIVIDEND_FLAT_KEYS: ReadonlySet<string> = new Set(['date', 'ticker', 'amount']);

export function useDividendsTableData({
  dividendsReceived,
  viewMode = 'grouped',
  displayCurrency,
}: UseDividendsTableDataArgs) {
  const isGrouped = viewMode === 'grouped';
  const buildGroups = isGrouped ? buildDividendGroups : buildDividendGroupsFlat;
  const validSortKeys = isGrouped ? DIVIDEND_GROUPED_KEYS : DIVIDEND_FLAT_KEYS;

  const sortFn = useCallback(
    (groups: DividendTickerGroup[], sortKey: string, sortAsc: boolean) =>
      sortDividendGroups(groups, sortKey, sortAsc, displayCurrency),
    [displayCurrency],
  );

  const {
    filteredGroups: filteredDividends,
    pagedGroups: pagedDividends,
    ...rest
  } = useGroupedTableData({
    items: dividendsReceived,
    buildGroups,
    sortFn,
    validSortKeys,
    ascOnSelect: ascOnTickerSelect,
  });

  const dividendTotals = useMemo(() => {
    const totalUsd = filteredDividends.reduce((sum, g) => sum + g.totalAmount, 0);
    const allHaveEur = filteredDividends.every((g) => g.totalAmountEur != null);
    const totalEur = allHaveEur
      ? filteredDividends.reduce((sum, g) => sum + (g.totalAmountEur ?? 0), 0)
      : null;
    const count = filteredDividends.reduce((sum, g) => sum + g.payments.length, 0);
    return { totalUsd, totalEur, count };
  }, [filteredDividends]);

  return {
    ...rest,
    filteredDividends,
    pagedDividends,
    dividendTotals,
  };
}

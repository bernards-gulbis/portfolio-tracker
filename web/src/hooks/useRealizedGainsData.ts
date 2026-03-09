import { useMemo, useState } from 'react';
import type { RealizedSale, DividendReceived } from '../api';

// ================== Types ==================

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

// ================== Helpers ==================

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

// ================== Generic Grouped Table Hook ==================

interface UseGroupedTableDataArgs<TItem extends { date: string }, TGroup extends { ticker: string }> {
  items: TItem[];
  buildGroups: (filtered: TItem[]) => TGroup[];
  sortFn: (groups: TGroup[], sortKey: string, sortAsc: boolean) => TGroup[];
}

function useGroupedTableData<TItem extends { date: string }, TGroup extends { ticker: string }>({
  items,
  buildGroups,
  sortFn,
}: UseGroupedTableDataArgs<TItem, TGroup>) {
  const [expandState, setExpandState] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string>('all');

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
      setSortAsc(false);
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

// ================== Gains Hook ==================

interface UseGainsTableDataArgs {
  realizedSales: RealizedSale[];
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

const sortGainGroups = (groups: TickerGroup[], sortKey: string, sortAsc: boolean): TickerGroup[] =>
  [...groups].sort((a, b) => {
    if (sortKey === 'date') {
      const diff = a.sales[0].date.localeCompare(b.sales[0].date);
      return sortAsc ? diff : -diff;
    }
    const diff = sortKey === 'count'
      ? a.sales.length - b.sales.length
      : a.totalGain - b.totalGain;
    return sortAsc ? diff : -diff;
  });

export function useGainsTableData({ realizedSales }: UseGainsTableDataArgs) {
  const {
    filteredGroups: filteredGains,
    pagedGroups: pagedGains,
    ...rest
  } = useGroupedTableData({
    items: realizedSales,
    buildGroups: buildGainGroups,
    sortFn: sortGainGroups,
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

// ================== Dividends Hook ==================

interface UseDividendsTableDataArgs {
  dividendsReceived: DividendReceived[];
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

const sortDividendGroups = (groups: DividendTickerGroup[], sortKey: string, sortAsc: boolean): DividendTickerGroup[] =>
  [...groups].sort((a, b) => {
    if (sortKey === 'date') {
      const diff = a.payments[0].date.localeCompare(b.payments[0].date);
      return sortAsc ? diff : -diff;
    }
    const diff = sortKey === 'count'
      ? a.payments.length - b.payments.length
      : (a.totalAmountEur ?? a.totalAmount) - (b.totalAmountEur ?? b.totalAmount);
    return sortAsc ? diff : -diff;
  });

export function useDividendsTableData({ dividendsReceived }: UseDividendsTableDataArgs) {
  const {
    filteredGroups: filteredDividends,
    pagedGroups: pagedDividends,
    ...rest
  } = useGroupedTableData({
    items: dividendsReceived,
    buildGroups: buildDividendGroups,
    sortFn: sortDividendGroups,
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

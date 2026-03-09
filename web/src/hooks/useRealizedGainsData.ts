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

// ================== Hook ==================

interface UseRealizedGainsDataArgs {
  realizedSales: RealizedSale[];
  dividendsReceived: DividendReceived[];
}

export function useRealizedGainsData({ realizedSales, dividendsReceived }: UseRealizedGainsDataArgs) {
  const initialTab = realizedSales.length > 0 ? 'gains' : 'dividends';
  const [tab, setTab] = useState<'gains' | 'dividends'>(initialTab);
  const [expandState, setExpandState] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string>('all');

  const availableYears = useMemo(() => {
    const years = new Set([
      ...realizedSales.map((s) => s.date.slice(0, 4)),
      ...dividendsReceived.map((d) => d.date.slice(0, 4)),
    ]);
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [realizedSales, dividendsReceived]);

  const filteredSales = useMemo(() => {
    if (yearFilter === 'all') return realizedSales;
    return realizedSales.filter((s) => s.date.startsWith(yearFilter));
  }, [realizedSales, yearFilter]);

  const filteredDividendsReceived = useMemo(() => {
    if (yearFilter === 'all') return dividendsReceived;
    return dividendsReceived.filter((d) => d.date.startsWith(yearFilter));
  }, [dividendsReceived, yearFilter]);

  // ================== Grouping ==================

  const gainGroups = useMemo(() => {
    const map = groupByTicker(filteredSales);
    const result: TickerGroup[] = [];
    for (const [ticker, sales] of map) {
      result.push({
        ticker,
        sales,
        totalGain: sales.reduce((sum, s) => sum + s.realized_gain, 0),
      });
    }
    return result;
  }, [filteredSales]);

  const dividendGroups = useMemo(() => {
    const map = groupByTicker(filteredDividendsReceived);
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
  }, [filteredDividendsReceived]);

  // ================== Filtering + sorting ==================

  const filteredGains = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const list = q ? gainGroups.filter((g) => g.ticker.includes(q)) : gainGroups;
    return [...list].sort((a, b) => {
      if (sortKey === 'date') {
        const diff = a.sales[0].date.localeCompare(b.sales[0].date);
        return sortAsc ? diff : -diff;
      }
      const diff = sortKey === 'count'
        ? a.sales.length - b.sales.length
        : a.totalGain - b.totalGain;
      return sortAsc ? diff : -diff;
    });
  }, [gainGroups, filter, sortKey, sortAsc]);

  const filteredDividends = useMemo(() => {
    const q = filter.trim().toUpperCase();
    const list = q ? dividendGroups.filter((g) => g.ticker.includes(q)) : dividendGroups;
    return [...list].sort((a, b) => {
      if (sortKey === 'date') {
        const diff = a.payments[0].date.localeCompare(b.payments[0].date);
        return sortAsc ? diff : -diff;
      }
      const diff = sortKey === 'count'
        ? a.payments.length - b.payments.length
        : (a.totalAmountEur ?? a.totalAmount) - (b.totalAmountEur ?? b.totalAmount);
      return sortAsc ? diff : -diff;
    });
  }, [dividendGroups, filter, sortKey, sortAsc]);

  // ================== Pagination ==================

  const activeListLength = tab === 'gains' ? filteredGains.length : filteredDividends.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedGains = tab === 'gains'
    ? filteredGains.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : [];
  const pagedDividends = tab === 'dividends'
    ? filteredDividends.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : [];

  // ================== Totals ==================

  const gainsTotals = useMemo(() => ({
    gain: filteredGains.reduce((sum, g) => sum + g.totalGain, 0),
    count: filteredGains.reduce((sum, g) => sum + g.sales.length, 0),
  }), [filteredGains]);

  const dividendTotals = useMemo(() => {
    const totalUsd = filteredDividends.reduce((sum, g) => sum + g.totalAmount, 0);
    const allHaveEur = filteredDividends.every((g) => g.totalAmountEur != null);
    const totalEur = allHaveEur
      ? filteredDividends.reduce((sum, g) => sum + (g.totalAmountEur ?? 0), 0)
      : null;
    const count = filteredDividends.reduce((sum, g) => sum + g.payments.length, 0);
    return { totalUsd, totalEur, count };
  }, [filteredDividends]);

  // ================== Handlers ==================

  const handleTabChange = (value: string) => {
    setTab(value as 'gains' | 'dividends');
    setExpandState(new Set());
    setSortKey('date');
    setSortAsc(false);
    setPage(1);
  };

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
    tab,
    expandState,
    sortKey,
    sortAsc,
    filter,
    yearFilter,
    availableYears,
    filteredGains,
    filteredDividends,
    pagedGains,
    pagedDividends,
    gainsTotals,
    dividendTotals,
    safePage,
    totalPages,
    setPage,
    handleTabChange,
    handleYearChange,
    handleFilterChange,
    handleSort,
    toggleExpand,
    hasGains: realizedSales.length > 0,
    hasDividends: dividendsReceived.length > 0,
  };
}

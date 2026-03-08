import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSignedCurrency, formatSignedPercent, formatDateCompact, formatCurrency, formatQuantity, getValueClass } from '../utils/formatters';
import type { RealizedSale, DividendReceived } from '../api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ChevronRightIcon, ChevronLeftIcon } from 'lucide-react';

const PAGE_SIZE = 10;

// ================== Realized Gains types ==================

interface TickerGroup {
  ticker: string;
  sales: RealizedSale[];
  totalGain: number;
}

// ================== Dividends types ==================

interface DividendTickerGroup {
  ticker: string;
  payments: DividendReceived[];
  totalAmount: number;
  totalAmountEur: number | null;
}

// ================== Props ==================

interface RealizedGainsTableProps {
  realizedSales: RealizedSale[];
  dividendsReceived: DividendReceived[];
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

export const RealizedGainsTable = memo(({ realizedSales, dividendsReceived, displayCurrency, locale }: RealizedGainsTableProps) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'gains' | 'dividends'>('gains');
  const [expandState, setExpandState] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const handleTabChange = (value: string) => {
    setTab(value as 'gains' | 'dividends');
    setExpandState(new Set());
    setSortKey('date');
    setSortAsc(false);
    setPage(1);
  };

  // ================== Realized Gains grouping ==================

  const gainGroups = useMemo(() => {
    const map = new Map<string, RealizedSale[]>();
    for (const sale of realizedSales) {
      const list = map.get(sale.ticker);
      if (list) {
        list.push(sale);
      } else {
        map.set(sale.ticker, [sale]);
      }
    }
    const result: TickerGroup[] = [];
    for (const [ticker, sales] of map) {
      sales.sort((a, b) => b.date.localeCompare(a.date));
      result.push({
        ticker,
        sales,
        totalGain: sales.reduce((sum, s) => sum + s.realized_gain, 0),
      });
    }
    return result;
  }, [realizedSales]);

  // ================== Dividends grouping ==================

  const dividendGroups = useMemo(() => {
    const map = new Map<string, DividendReceived[]>();
    for (const d of dividendsReceived) {
      const list = map.get(d.ticker);
      if (list) {
        list.push(d);
      } else {
        map.set(d.ticker, [d]);
      }
    }
    const result: DividendTickerGroup[] = [];
    for (const [ticker, payments] of map) {
      payments.sort((a, b) => b.date.localeCompare(a.date));
      const totalAmountEurParts = payments.filter((p) => p.amount_eur != null);
      result.push({
        ticker,
        payments,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        totalAmountEur: totalAmountEurParts.length > 0
          ? totalAmountEurParts.reduce((sum, p) => sum + (p.amount_eur ?? 0), 0)
          : null,
      });
    }
    return result;
  }, [dividendsReceived]);

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

  const activeList = tab === 'gains' ? filteredGains : filteredDividends;
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedGains = tab === 'gains'
    ? filteredGains.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : [];
  const pagedDividends = tab === 'dividends'
    ? filteredDividends.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : [];

  const gainsTotals = useMemo(() => ({
    gain: filteredGains.reduce((sum, g) => sum + g.totalGain, 0),
    count: filteredGains.reduce((sum, g) => sum + g.sales.length, 0),
  }), [filteredGains]);

  const dividendTotals = useMemo(() => {
    const totalUsd = filteredDividends.reduce((sum, g) => sum + g.totalAmount, 0);
    const eurParts = filteredDividends.filter((g) => g.totalAmountEur != null);
    const totalEur = eurParts.length > 0
      ? eurParts.reduce((sum, g) => sum + (g.totalAmountEur ?? 0), 0)
      : null;
    const count = filteredDividends.reduce((sum, g) => sum + g.payments.length, 0);
    return { totalUsd, totalEur, count };
  }, [filteredDividends]);

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

  const hasGains = realizedSales.length > 0;
  const hasDividends = dividendsReceived.length > 0;

  if (!hasGains && !hasDividends) {
    return null;
  }

  return (
    <div className="mt-6">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between mb-3">
          <TabsList className="h-8">
            {hasGains && (
              <TabsTrigger value="gains" className="text-xs px-3">
                {t('status.realizedGains')}
              </TabsTrigger>
            )}
            {hasDividends && (
              <TabsTrigger value="dividends" className="text-xs px-3">
                {t('status.dividendsReceived')}
              </TabsTrigger>
            )}
          </TabsList>
          <Input
            name="ticker-filter"
            placeholder={t('status.columns.ticker')}
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="w-40 h-8 text-sm"
          />
        </div>

        {/* Realized Gains Tab */}
        <TabsContent value="gains">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('date')}
                  >
                    {t('status.columns.date')}{sortKey === 'date' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('count')}
                  >
                    {t('status.columns.sells')}{sortKey === 'count' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                  <TableHead
                    className="min-w-[7rem] text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('gain')}
                  >
                    {t('status.columns.realizedGL')}{sortKey === 'gain' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedGains.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                      {t('status.noRealizedGains')}
                    </TableCell>
                  </TableRow>
                )}
                {pagedGains.map((group) => (
                  <GainsTickerGroupRow
                    key={group.ticker}
                    group={group}
                    isExpanded={expandState.has(group.ticker)}
                    onToggle={toggleExpand}
                    locale={locale}
                  />
                ))}
                {filteredGains.length > 0 && (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="text-sm">{t('status.total')}</TableCell>
                    <TableCell />
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {t('status.sellCount', { count: gainsTotals.count })}
                      </Badge>
                    </TableCell>
                    <TableCell className={`min-w-[7rem] text-right text-sm tabular-nums ${getValueClass(gainsTotals.gain)}`}>
                      {formatSignedCurrency(gainsTotals.gain, 'USD', locale)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />}
          </Card>
        </TabsContent>

        {/* Dividends Tab */}
        <TabsContent value="dividends">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('date')}
                  >
                    {t('status.columns.date')}{sortKey === 'date' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('count')}
                  >
                    {t('status.columns.payments')}{sortKey === 'count' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                  <TableHead
                    className="min-w-[7rem] text-right cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort('amount')}
                  >
                    {t('status.columns.amount')}{sortKey === 'amount' ? (sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDividends.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">
                      {t('status.noDividends')}
                    </TableCell>
                  </TableRow>
                )}
                {pagedDividends.map((group) => (
                  <DividendTickerGroupRow
                    key={group.ticker}
                    group={group}
                    isExpanded={expandState.has(group.ticker)}
                    onToggle={toggleExpand}
                    displayCurrency={displayCurrency}
                    locale={locale}
                  />
                ))}
                {filteredDividends.length > 0 && (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="text-sm">{t('status.total')}</TableCell>
                    <TableCell />
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {t('status.paymentCount', { count: dividendTotals.count })}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[7rem] text-right text-sm tabular-nums">
                      {displayCurrency === 'EUR' && dividendTotals.totalEur != null
                        ? formatCurrency(dividendTotals.totalEur, 'EUR', locale)
                        : formatCurrency(dividendTotals.totalUsd, 'USD', locale)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
});

RealizedGainsTable.displayName = 'RealizedGainsTable';

// ================== Pagination ==================

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const PaginationControls = ({ page, totalPages, onPageChange }: PaginationControlsProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 border-t">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground">
        {t('status.pageOf', { page, total: totalPages })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

// ================== Gains Row ==================

interface GainsTickerGroupRowProps {
  group: TickerGroup;
  isExpanded: boolean;
  onToggle: (ticker: string) => void;
  locale: string;
}

const GainsTickerGroupRow = ({ group, isExpanded, onToggle, locale }: GainsTickerGroupRowProps) => {
  const { t } = useTranslation();

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onToggle(group.ticker)}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <ChevronRightIcon className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">{group.ticker}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDateCompact(group.sales[0].date, locale)}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs">
            {t('status.sellCount', { count: group.sales.length })}
          </Badge>
        </TableCell>
        <TableCell className={`min-w-[7rem] text-right text-sm font-medium tabular-nums ${getValueClass(group.totalGain)}`}>
          {formatSignedCurrency(group.totalGain, 'USD', locale)}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={4} className="p-0">
            <div className="bg-muted/30 pl-11 pr-4 py-2 max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('status.columns.date')}</TableHead>
                    <TableHead className="text-right">{t('status.columns.daysHeld')}</TableHead>
                    <TableHead className="text-right">{t('status.columns.quantity')}</TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col">
                        <span>{t('status.columns.buyTotal')}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex flex-col">
                        <span>{t('status.columns.sellTotal')}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">{t('status.priceCaption')}</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">{t('status.columns.realizedGL')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.sales.map((sale, idx) => {
                    const sellPrice = sale.quantity > 0 ? sale.proceeds / sale.quantity : 0;
                    const buyPrice = sale.quantity > 0 ? sale.cost_basis / sale.quantity : 0;
                    const isPartialSell = sale.quantity_before - sale.quantity > 1e-6;
                    return (
                      <TableRow key={`${sale.date}-${idx}`}>
                        <TableCell className="text-muted-foreground">{formatDateCompact(sale.date, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{sale.days_held}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          <span>{formatQuantity(sale.quantity)}</span>
                          {isPartialSell ? (
                            <span className="flex items-center justify-end gap-1.5 mt-0.5">
                              <Progress value={(sale.quantity / sale.quantity_before) * 100} className="h-1 w-16" />
                              <span className="text-[10px] text-muted-foreground/70">
                                {t('status.ofTotal', { total: formatQuantity(sale.quantity_before) })}
                              </span>
                            </span>
                          ) : (
                            <span className="block text-[10px] text-muted-foreground/70">{t('status.allSold')}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          <span>{formatCurrency(sale.cost_basis, 'USD', locale)}</span>
                          <span className="block text-[10px] text-muted-foreground/70">{formatCurrency(buyPrice, 'USD', locale)}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          <span>{formatCurrency(sale.proceeds, 'USD', locale)}</span>
                          <span className="block text-[10px] text-muted-foreground/70">{formatCurrency(sellPrice, 'USD', locale)}</span>
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${getValueClass(sale.realized_gain)}`}>
                          <span>{formatSignedCurrency(sale.realized_gain, 'USD', locale)}</span>
                          <span className={`block text-[10px] font-bold ${getValueClass(sale.realized_gain)}`}>
                            {formatSignedPercent(sale.cost_basis > 0 ? (sale.realized_gain / sale.cost_basis) * 100 : null)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

// ================== Dividends Row ==================

interface DividendTickerGroupRowProps {
  group: DividendTickerGroup;
  isExpanded: boolean;
  onToggle: (ticker: string) => void;
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

const DividendTickerGroupRow = ({ group, isExpanded, onToggle, displayCurrency, locale }: DividendTickerGroupRowProps) => {
  const { t } = useTranslation();

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onToggle(group.ticker)}>
        <TableCell>
          <div className="flex items-center gap-2.5">
            <ChevronRightIcon className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">{group.ticker}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{formatDateCompact(group.payments[0].date, locale)}</TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs">
            {t('status.paymentCount', { count: group.payments.length })}
          </Badge>
        </TableCell>
        <TableCell className="min-w-[7rem] text-right text-sm font-medium tabular-nums">
          {displayCurrency === 'EUR' && group.totalAmountEur != null
            ? formatCurrency(group.totalAmountEur, 'EUR', locale)
            : formatCurrency(group.totalAmount, 'USD', locale)}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={4} className="p-0">
            <div className="bg-muted/30 pl-11 pr-4 py-2 max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('status.columns.date')}</TableHead>
                    <TableHead className="text-right">{t('status.columns.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.payments.map((payment, idx) => (
                    <TableRow key={`${payment.date}-${idx}`}>
                      <TableCell className="text-muted-foreground">{formatDateCompact(payment.date, locale)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {displayCurrency === 'EUR' && payment.amount_eur != null
                          ? formatCurrency(payment.amount_eur, 'EUR', locale)
                          : formatCurrency(payment.amount, 'USD', locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

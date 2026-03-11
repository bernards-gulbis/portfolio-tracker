import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSignedCurrency, formatDateCompact, formatCurrency, getValueClass } from '../utils/formatters';
import type { WithdrawalFx } from '../api';
import { computeWithdrawalTaxMap } from '../utils/eurMetrics';
import { Card } from '@/components/ui/card';
import { Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { SortableTableHead } from './SortableTableHead';
import { FilterControls } from './RealizedGainsTable';

const PAGE_SIZE = 10;

interface WithdrawalsTableProps {
  realizedWithdrawals: WithdrawalFx[];
  locale: string;
  principalEur: number;
  dividendsEur: number | null;
  taxRate: number;
}

export const WithdrawalsTable = memo(({ realizedWithdrawals, locale, principalEur, dividendsEur, taxRate }: WithdrawalsTableProps) => {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string>('all');

  const availableYears = useMemo(() => {
    const years = new Set(realizedWithdrawals.map((w) => w.date.slice(0, 4)));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [realizedWithdrawals]);

  const indexedWithdrawals = useMemo(
    () => realizedWithdrawals.map((w, origIdx) => ({ w, origIdx })),
    [realizedWithdrawals],
  );

  const filteredWithdrawals = useMemo(() => {
    if (yearFilter === 'all') return indexedWithdrawals;
    return indexedWithdrawals.filter(({ w }) => w.date.startsWith(yearFilter));
  }, [indexedWithdrawals, yearFilter]);

  const sortedWithdrawals = useMemo(() => {
    const list = [...filteredWithdrawals];
    return list.sort((a, b) => {
      let diff: number;
      if (sortKey === 'amount') diff = a.w.amount - b.w.amount;
      else if (sortKey === 'fx_gain') diff = a.w.realized_fx_gain - b.w.realized_fx_gain;
      else diff = a.w.date.localeCompare(b.w.date);
      return sortAsc ? diff : -diff;
    });
  }, [filteredWithdrawals, sortKey, sortAsc]);

  const withdrawalTaxMap = useMemo(
    () => computeWithdrawalTaxMap(realizedWithdrawals, principalEur, dividendsEur),
    [realizedWithdrawals, principalEur, dividendsEur],
  );

  const totalPages = Math.max(1, Math.ceil(sortedWithdrawals.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedWithdrawals = sortedWithdrawals.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const withdrawalTotals = useMemo(() => {
    let totalTaxable = 0;
    for (const { origIdx } of filteredWithdrawals) {
      totalTaxable += withdrawalTaxMap.get(origIdx) ?? 0;
    }
    return {
      amount: sortedWithdrawals.reduce((sum, { w }) => sum + w.amount, 0),
      eurAvg: sortedWithdrawals.reduce((sum, { w }) => sum + w.amount_eur_avg, 0),
      eurReceived: sortedWithdrawals.reduce((sum, { w }) => sum + w.amount_eur, 0),
      fxGain: sortedWithdrawals.reduce((sum, { w }) => sum + w.realized_fx_gain, 0),
      taxable: totalTaxable,
    };
  }, [sortedWithdrawals, filteredWithdrawals, withdrawalTaxMap]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(1);
  };

  const handleYearChange = (value: string) => {
    setYearFilter(value);
    setPage(1);
  };

  if (realizedWithdrawals.length === 0) return null;

  return (
    <div className="mt-4">
      <FilterControls
        availableYears={availableYears}
        yearFilter={yearFilter}
        onYearChange={handleYearChange}
      />
      <Card>
        <Table>
          <TableCaption className="sr-only">{t('status.withdrawals')}</TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead label={t('status.columns.date')} sortKey="date" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
              <SortableTableHead label={t('status.columns.amountUsd')} sortKey="amount" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="text-right" />
              <TableHead className="text-right">{t('status.columns.eurCostAvg')}</TableHead>
              <TableHead className="text-right">{t('status.columns.eurReceived')}</TableHead>
              <SortableTableHead label={t('status.columns.realizedFxGL')} sortKey="fx_gain" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="min-w-[7rem] text-right" />
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  {t('status.columns.tax')} ({new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(taxRate * 100)}%)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        <p>{t('settings.tax.taxExplanation')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedWithdrawals.map(({ w, origIdx }, idx) => {
              const taxable = withdrawalTaxMap.get(origIdx) ?? 0;
              return (
                <TableRow key={`${w.date}-${idx}`}>
                  <TableCell>{formatDateCompact(w.date, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.amount, 'USD', locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.amount_eur_avg, 'EUR', locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.amount_eur, 'EUR', locale)}</TableCell>
                  <TableCell className={`min-w-[7rem] text-right tabular-nums ${getValueClass(w.realized_fx_gain)}`}>
                    {formatSignedCurrency(w.realized_fx_gain, 'EUR', locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {taxable > 0 ? (
                      <>
                        <span>{formatCurrency(taxable * taxRate, 'EUR', locale)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t('status.on')} {formatCurrency(taxable, 'EUR', locale)}
                        </span>
                      </>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              );
            })}
            {sortedWithdrawals.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>{t('status.total')}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(withdrawalTotals.amount, 'USD', locale)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(withdrawalTotals.eurAvg, 'EUR', locale)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(withdrawalTotals.eurReceived, 'EUR', locale)}</TableCell>
                <TableCell className={`min-w-[7rem] text-right tabular-nums ${getValueClass(withdrawalTotals.fxGain)}`}>
                  {formatSignedCurrency(withdrawalTotals.fxGain, 'EUR', locale)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {withdrawalTotals.taxable > 0 ? (
                    <>
                      <span>{formatCurrency(withdrawalTotals.taxable * taxRate, 'EUR', locale)}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t('status.on')} {formatCurrency(withdrawalTotals.taxable, 'EUR', locale)}
                      </span>
                    </>
                  ) : '-'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />}
      </Card>
    </div>
  );
});

WithdrawalsTable.displayName = 'WithdrawalsTable';

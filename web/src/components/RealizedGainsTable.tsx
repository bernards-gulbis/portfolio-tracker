import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSignedCurrency, formatSignedPercent, formatDateCompact, formatCurrency, formatQuantity, formatDaysHeld, getValueClass } from '../utils/formatters';
import { useDaysHeldLabels } from '../hooks/useDaysHeldLabels';
import { useRealizedGainsData } from '../hooks/useRealizedGainsData';
import type { TickerGroup, DividendTickerGroup } from '../hooks/useRealizedGainsData';
import type { RealizedSale, DividendReceived } from '../api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronRightIcon } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { SortableTableHead } from './SortableTableHead';
import { RealizedGainsInsights } from './RealizedGainsInsights';

// ================== Props ==================

interface RealizedGainsTableProps {
  realizedSales: RealizedSale[];
  dividendsReceived: DividendReceived[];
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

export const RealizedGainsTable = memo(({ realizedSales, dividendsReceived, displayCurrency, locale }: RealizedGainsTableProps) => {
  const { t } = useTranslation();
  const {
    tab, expandState, sortKey, sortAsc, filter, yearFilter,
    availableYears, filteredGains, filteredDividends,
    pagedGains, pagedDividends, gainsTotals, dividendTotals,
    safePage, totalPages, setPage,
    handleTabChange, handleYearChange, handleFilterChange, handleSort, toggleExpand,
    hasGains, hasDividends,
  } = useRealizedGainsData({ realizedSales, dividendsReceived });

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
          <div className="flex items-center gap-2">
            {availableYears.length > 1 && (
              <Select value={yearFilter} onValueChange={handleYearChange}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('status.allYears')}</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              name="ticker-filter"
              placeholder={t('status.columns.ticker')}
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="w-40 h-8 text-sm"
            />
          </div>
        </div>

        {/* Realized Gains Tab */}
        <TabsContent value="gains">
          <RealizedGainsInsights filteredGains={filteredGains} locale={locale} />
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <SortableTableHead label={t('status.columns.date')} sortKey="date" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.sells')} sortKey="count" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.realizedGL')} sortKey="gain" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="min-w-[7rem] text-right" />
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
                  <SortableTableHead label={t('status.columns.date')} sortKey="date" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.payments')} sortKey="count" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.amount')} sortKey="amount" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="min-w-[7rem] text-right" />
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

// ================== Gains Row ==================

interface GainsTickerGroupRowProps {
  group: TickerGroup;
  isExpanded: boolean;
  onToggle: (ticker: string) => void;
  locale: string;
}

const GainsTickerGroupRow = ({ group, isExpanded, onToggle, locale }: GainsTickerGroupRowProps) => {
  const { t } = useTranslation();
  const daysLabels = useDaysHeldLabels();

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
              <TooltipProvider>
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
                    const daysHeld = Math.floor((new Date(sale.date).getTime() - new Date(sale.first_buy_date).getTime()) / 86_400_000);
                    return (
                      <TableRow key={`${sale.date}-${idx}`}>
                        <TableCell className="text-muted-foreground">{formatDateCompact(sale.date, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground">
                                {formatDaysHeld(daysHeld, daysLabels)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{daysHeld} {t('status.columns.daysHeld').toLocaleLowerCase()}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
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
              </TooltipProvider>
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

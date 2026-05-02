import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSignedCurrency, formatSignedPercent, formatDateCompact, formatCurrency, formatQuantity, formatDaysHeld, getValueClass, MS_PER_DAY } from '../utils/formatters';
import { useDaysHeldLabels } from '../hooks/useDaysHeldLabels';
import { useGainsTableData, useDividendsTableData } from '../hooks/useRealizedGainsData';
import type { TickerGroup, DividendTickerGroup } from '../hooks/useRealizedGainsData';
import type { RealizedSale, DividendReceived } from '../api';
import { useTableViewMode, type TableViewMode } from '../hooks/useTableViewMode';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronRightIcon } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { SortableTableHead } from './SortableTableHead';

interface FilterControlsProps {
  availableYears: string[];
  yearFilter: string;
  onYearChange: (value: string) => void;
  filter?: string;
  onFilterChange?: (value: string) => void;
  viewMode?: TableViewMode;
  onViewModeChange?: (mode: TableViewMode) => void;
}

export const FilterControls = ({ availableYears, yearFilter, onYearChange, filter, onFilterChange, viewMode, onViewModeChange }: FilterControlsProps) => {
  const { t } = useTranslation();
  const showYearSelect = availableYears.length > 1;
  const showTickerFilter = filter !== undefined && onFilterChange !== undefined;
  const showViewModeToggle = viewMode !== undefined && onViewModeChange !== undefined;

  if (!showYearSelect && !showTickerFilter && !showViewModeToggle) return null;

  return (
    <div className="flex items-center gap-2 mb-3">
      {showYearSelect && (
        <Select value={yearFilter} onValueChange={onYearChange}>
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
      {showTickerFilter && (
        <Input
          name="ticker-filter"
          placeholder={t('status.columns.ticker')}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-40 h-8 text-sm"
        />
      )}
      {showViewModeToggle && (
        <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as TableViewMode)} className="ml-auto">
          <TabsList aria-label={t('status.viewMode.aria')}>
            <TabsTrigger value="ungrouped">{t('status.viewMode.ungrouped')}</TabsTrigger>
            <TabsTrigger value="grouped">{t('status.viewMode.grouped')}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </div>
  );
};

interface EmptyTableRowProps {
  colSpan: number;
  message: string;
}

const EmptyTableRow = ({ colSpan, message }: EmptyTableRowProps) => (
  <TableRow>
    <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-6 text-sm">
      {message}
    </TableCell>
  </TableRow>
);

function formatDividendAmount(
  amountUsd: number,
  amountEur: number | null,
  displayCurrency: 'EUR' | 'USD',
  locale: string,
): string {
  if (displayCurrency === 'EUR' && amountEur != null) {
    return formatCurrency(amountEur, 'EUR', locale);
  }
  return formatCurrency(amountUsd, 'USD', locale);
}

interface ExpandableGroupRowProps {
  ticker: string;
  isExpanded: boolean;
  onToggle: (ticker: string) => void;
  summaryColumns: React.ReactNode;
  expandedContent: React.ReactNode;
  colSpan: number;
}

const ExpandableGroupRow = ({ ticker, isExpanded, onToggle, summaryColumns, expandedContent, colSpan }: ExpandableGroupRowProps) => (
  <>
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onToggle(ticker)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(ticker); } }}
      tabIndex={0}
      role="button"
    >
      <TableCell>
        <div className="flex items-center gap-2.5">
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <span className="text-sm font-medium">{ticker}</span>
        </div>
      </TableCell>
      {summaryColumns}
    </TableRow>
    {isExpanded && (
      <TableRow>
        <TableCell colSpan={colSpan} className="p-0">
          <div className="bg-muted/30 pl-11 pr-4 py-2 max-h-80 overflow-y-auto">
            {expandedContent}
          </div>
        </TableCell>
      </TableRow>
    )}
  </>
);

interface GainsSaleRowProps {
  sale: RealizedSale;
  locale: string;
  showTicker?: boolean;
}

const GainsSaleRow = ({ sale, locale, showTicker = false }: GainsSaleRowProps) => {
  const { t } = useTranslation();
  const daysLabels = useDaysHeldLabels();
  const sellPrice = sale.quantity > 0 ? sale.proceeds / sale.quantity : 0;
  const buyPrice = sale.quantity > 0 ? sale.cost_basis / sale.quantity : 0;
  const isPartialSell = sale.quantity_before - sale.quantity > 1e-6;
  const daysHeld = Math.floor((new Date(sale.date).getTime() - new Date(sale.first_buy_date).getTime()) / MS_PER_DAY);

  return (
    <TableRow>
      {showTicker && (
        <TableCell className="text-sm font-medium">{sale.ticker}</TableCell>
      )}
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
            <span className="text-xs text-muted-foreground">
              {t('status.ofTotal', { total: formatQuantity(sale.quantity_before) })}
            </span>
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">{t('status.allSold')}</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        <span>{formatCurrency(sale.cost_basis, 'USD', locale)}</span>
        <span className="block text-xs text-muted-foreground">{formatCurrency(buyPrice, 'USD', locale)}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        <span>{formatCurrency(sale.proceeds, 'USD', locale)}</span>
        <span className="block text-xs text-muted-foreground">{formatCurrency(sellPrice, 'USD', locale)}</span>
      </TableCell>
      <TableCell className={`text-right tabular-nums ${getValueClass(sale.realized_gain)}`}>
        <span>{formatSignedCurrency(sale.realized_gain, 'USD', locale)}</span>
        <span className={`block text-xs font-bold ${getValueClass(sale.realized_gain)}`}>
          {formatSignedPercent(sale.cost_basis > 0 ? (sale.realized_gain / sale.cost_basis) * 100 : null)}
        </span>
      </TableCell>
    </TableRow>
  );
};

const GainsSaleHeaderMiddleColumns = () => {
  const { t } = useTranslation();
  return (
    <>
      <TableHead className="text-right">{t('status.columns.daysHeld')}</TableHead>
      <TableHead className="text-right">{t('status.columns.quantity')}</TableHead>
      <TableHead className="text-right">
        <div className="flex flex-col">
          <span>{t('status.columns.buyTotal')}</span>
          <span className="text-xs font-normal text-muted-foreground">{t('status.priceCaption')}</span>
        </div>
      </TableHead>
      <TableHead className="text-right">
        <div className="flex flex-col">
          <span>{t('status.columns.sellTotal')}</span>
          <span className="text-xs font-normal text-muted-foreground">{t('status.priceCaption')}</span>
        </div>
      </TableHead>
    </>
  );
};

interface DividendPaymentRowProps {
  payment: DividendReceived;
  displayCurrency: 'EUR' | 'USD';
  locale: string;
  showTicker?: boolean;
}

const DividendPaymentRow = ({ payment, displayCurrency, locale, showTicker = false }: DividendPaymentRowProps) => (
  <TableRow>
    {showTicker && (
      <TableCell className="text-sm font-medium">{payment.ticker}</TableCell>
    )}
    <TableCell className="text-muted-foreground">{formatDateCompact(payment.date, locale)}</TableCell>
    <TableCell className="text-right tabular-nums text-muted-foreground">
      {formatDividendAmount(payment.amount, payment.amount_eur, displayCurrency, locale)}
    </TableCell>
  </TableRow>
);

interface GainsTotalsRowProps {
  isGrouped: boolean;
  gain: number;
  count: number;
  locale: string;
}

const GainsTotalsRow = ({ isGrouped, gain, count, locale }: GainsTotalsRowProps) => {
  const { t } = useTranslation();
  return (
    <TableRow className="bg-muted/30 font-semibold">
      <TableCell colSpan={isGrouped ? 1 : 5} className="text-sm">{t('status.total')}</TableCell>
      {isGrouped && <TableCell />}
      <TableCell className={isGrouped ? '' : 'text-right'}>
        <Badge variant="secondary" className="text-xs">
          {t('status.sellCount', { count })}
        </Badge>
      </TableCell>
      <TableCell className={`min-w-[7rem] text-right text-sm tabular-nums ${getValueClass(gain)}`}>
        {formatSignedCurrency(gain, 'USD', locale)}
      </TableCell>
    </TableRow>
  );
};

interface DividendsTotalsRowProps {
  isGrouped: boolean;
  totalUsd: number;
  totalEur: number | null;
  count: number;
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

const DividendsTotalsRow = ({ isGrouped, totalUsd, totalEur, count, displayCurrency, locale }: DividendsTotalsRowProps) => {
  const { t } = useTranslation();
  return (
    <TableRow className="bg-muted/30 font-semibold">
      <TableCell className="text-sm">{t('status.total')}</TableCell>
      {isGrouped && <TableCell />}
      <TableCell>
        <Badge variant="secondary" className="text-xs">
          {t('status.paymentCount', { count })}
        </Badge>
      </TableCell>
      <TableCell className="min-w-[7rem] text-right text-sm tabular-nums">
        {formatDividendAmount(totalUsd, totalEur, displayCurrency, locale)}
      </TableCell>
    </TableRow>
  );
};

interface RealizedGainsTableProps {
  realizedSales: RealizedSale[];
  locale: string;
}

export const RealizedGainsTable = memo(({ realizedSales, locale }: RealizedGainsTableProps) => {
  const { t } = useTranslation();
  const { viewMode, setViewMode } = useTableViewMode('pt_gains_view_mode', 'ungrouped');
  const {
    expandState, sortKey, sortAsc, filter, yearFilter,
    availableYears, filteredGains, pagedGains, gainsTotals,
    safePage, totalPages, setPage,
    handleYearChange, handleFilterChange, handleSort, toggleExpand,
  } = useGainsTableData({ realizedSales, viewMode });

  const isGrouped = viewMode === 'grouped';

  return (
    <div className="mt-4">
      <FilterControls
        availableYears={availableYears}
        yearFilter={yearFilter}
        onYearChange={handleYearChange}
        filter={filter}
        onFilterChange={handleFilterChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <TooltipProvider>
        <Card>
          <Table>
            <TableCaption className="sr-only">{t('status.realizedGains')}</TableCaption>
            {isGrouped ? (
              <>
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
                    <EmptyTableRow colSpan={4} message={t('status.noRealizedGains')} />
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
                    <GainsTotalsRow isGrouped gain={gainsTotals.gain} count={gainsTotals.count} locale={locale} />
                  )}
                </TableBody>
              </>
            ) : (
              <>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label={t('status.columns.ticker')} sortKey="ticker" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                    <SortableTableHead label={t('status.columns.date')} sortKey="date" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                    <GainsSaleHeaderMiddleColumns />
                    <SortableTableHead label={t('status.columns.realizedGL')} sortKey="gain" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="min-w-[7rem] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedGains.length === 0 && (
                    <EmptyTableRow colSpan={7} message={t('status.noRealizedGains')} />
                  )}
                  {pagedGains.map((group, idx) => (
                    <GainsSaleRow
                      key={`${group.ticker}-${group.sales[0].date}-${idx}`}
                      sale={group.sales[0]}
                      locale={locale}
                      showTicker
                    />
                  ))}
                  {filteredGains.length > 0 && (
                    <GainsTotalsRow isGrouped={false} gain={gainsTotals.gain} count={gainsTotals.count} locale={locale} />
                  )}
                </TableBody>
              </>
            )}
          </Table>
          {totalPages > 1 && <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />}
        </Card>
      </TooltipProvider>
    </div>
  );
});

RealizedGainsTable.displayName = 'RealizedGainsTable';

interface DividendsReceivedTableProps {
  dividendsReceived: DividendReceived[];
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

export const DividendsReceivedTable = memo(({ dividendsReceived, displayCurrency, locale }: DividendsReceivedTableProps) => {
  const { t } = useTranslation();
  const { viewMode, setViewMode } = useTableViewMode('pt_dividends_view_mode', 'ungrouped');
  const {
    expandState, sortKey, sortAsc, filter, yearFilter,
    availableYears, filteredDividends, pagedDividends, dividendTotals,
    safePage, totalPages, setPage,
    handleYearChange, handleFilterChange, handleSort, toggleExpand,
  } = useDividendsTableData({ dividendsReceived, viewMode });

  const isGrouped = viewMode === 'grouped';

  return (
    <div className="mt-4">
      <FilterControls
        availableYears={availableYears}
        yearFilter={yearFilter}
        onYearChange={handleYearChange}
        filter={filter}
        onFilterChange={handleFilterChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <Card>
        <Table>
          <TableCaption className="sr-only">{t('status.dividendsReceived')}</TableCaption>
          {isGrouped ? (
            <>
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
                  <EmptyTableRow colSpan={4} message={t('status.noDividends')} />
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
                  <DividendsTotalsRow
                    isGrouped
                    totalUsd={dividendTotals.totalUsd}
                    totalEur={dividendTotals.totalEur}
                    count={dividendTotals.count}
                    displayCurrency={displayCurrency}
                    locale={locale}
                  />
                )}
              </TableBody>
            </>
          ) : (
            <>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label={t('status.columns.ticker')} sortKey="ticker" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.date')} sortKey="date" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTableHead label={t('status.columns.amount')} sortKey="amount" activeSortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} className="min-w-[7rem] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedDividends.length === 0 && (
                  <EmptyTableRow colSpan={3} message={t('status.noDividends')} />
                )}
                {pagedDividends.map((group, idx) => (
                  <DividendPaymentRow
                    key={`${group.ticker}-${group.payments[0].date}-${idx}`}
                    payment={group.payments[0]}
                    displayCurrency={displayCurrency}
                    locale={locale}
                    showTicker
                  />
                ))}
                {filteredDividends.length > 0 && (
                  <DividendsTotalsRow
                    isGrouped={false}
                    totalUsd={dividendTotals.totalUsd}
                    totalEur={dividendTotals.totalEur}
                    count={dividendTotals.count}
                    displayCurrency={displayCurrency}
                    locale={locale}
                  />
                )}
              </TableBody>
            </>
          )}
        </Table>
        {totalPages > 1 && <PaginationControls page={safePage} totalPages={totalPages} onPageChange={setPage} />}
      </Card>
    </div>
  );
});

DividendsReceivedTable.displayName = 'DividendsReceivedTable';

interface GainsTickerGroupRowProps {
  group: TickerGroup;
  isExpanded: boolean;
  onToggle: (ticker: string) => void;
  locale: string;
}

const GainsTickerGroupRow = ({ group, isExpanded, onToggle, locale }: GainsTickerGroupRowProps) => {
  const { t } = useTranslation();

  return (
    <ExpandableGroupRow
      ticker={group.ticker}
      isExpanded={isExpanded}
      onToggle={onToggle}
      colSpan={4}
      summaryColumns={
        <>
          <TableCell className="text-xs text-muted-foreground">{formatDateCompact(group.sales[0].date, locale)}</TableCell>
          <TableCell>
            <Badge variant="secondary" className="text-xs">
              {t('status.sellCount', { count: group.sales.length })}
            </Badge>
          </TableCell>
          <TableCell className={`min-w-[7rem] text-right text-sm font-medium tabular-nums ${getValueClass(group.totalGain)}`}>
            {formatSignedCurrency(group.totalGain, 'USD', locale)}
          </TableCell>
        </>
      }
      expandedContent={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.date')}</TableHead>
              <GainsSaleHeaderMiddleColumns />
              <TableHead className="text-right">{t('status.columns.realizedGL')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.sales.map((sale, idx) => (
              <GainsSaleRow key={`${sale.date}-${idx}`} sale={sale} locale={locale} />
            ))}
          </TableBody>
        </Table>
      }
    />
  );
};

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
    <ExpandableGroupRow
      ticker={group.ticker}
      isExpanded={isExpanded}
      onToggle={onToggle}
      colSpan={4}
      summaryColumns={
        <>
          <TableCell className="text-xs text-muted-foreground">{formatDateCompact(group.payments[0].date, locale)}</TableCell>
          <TableCell>
            <Badge variant="secondary" className="text-xs">
              {t('status.paymentCount', { count: group.payments.length })}
            </Badge>
          </TableCell>
          <TableCell className="min-w-[7rem] text-right text-sm font-medium tabular-nums">
            {formatDividendAmount(group.totalAmount, group.totalAmountEur, displayCurrency, locale)}
          </TableCell>
        </>
      }
      expandedContent={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('status.columns.date')}</TableHead>
              <TableHead className="text-right">{t('status.columns.amount')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.payments.map((payment, idx) => (
              <DividendPaymentRow
                key={`${payment.date}-${idx}`}
                payment={payment}
                displayCurrency={displayCurrency}
                locale={locale}
              />
            ))}
          </TableBody>
        </Table>
      }
    />
  );
};

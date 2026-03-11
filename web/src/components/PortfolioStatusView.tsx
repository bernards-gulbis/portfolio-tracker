import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useLivePrices } from '../hooks/useLivePrices';
import { useNavigation } from '../context/NavigationContext';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatDateTime, getValueClass } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { getErrorMessage, PricedPortfolioStatus, PortfolioPerformance, PerformanceDataPoint, TransactionWarning, LivePrices, RealizedSale, DividendReceived } from '../api';
import { useCurrencyPreference, type Currency } from '../hooks/useCurrencyPreference';
import { computeEurMetrics } from '../utils/eurMetrics';
import { computePricedStatus } from '../utils/computePricedStatus';
import { HoldingsTable } from './HoldingsTable';
import { RealizedGainsTable, DividendsReceivedTable } from './RealizedGainsTable';
import { WithdrawalsTable } from './WithdrawalsTable';

const PerformanceChart = lazy(() =>
  import('./PerformanceChart').then((m) => ({ default: m.PerformanceChart }))
);
const HoldingsAllocationChart = lazy(() =>
  import('./HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart }))
);
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { AlertTriangleIcon, BriefcaseIcon, ChevronRightIcon, InboxIcon, InfoIcon, RefreshCwIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const EMPTY_DATA_POINTS: PerformanceDataPoint[] = [];
const EMPTY_LIVE: LivePrices = { prices: {}, usd_to_eur_rate: null, timestamp: '' };

const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: Currency = 'USD',
  locale: string = 'en-US'
): React.JSX.Element | string => {
  if (currencyValue == null) return '-';
  const formattedCurrency = formatSignedCurrency(currencyValue, currency, locale);
  const formattedPercent = percentValue == null ? '' : formatSignedPercent(percentValue);
  const percentClass = currencyValue >= 0 ? 'text-positive' : 'text-negative';
  return (
    <>
      <span>{formattedCurrency}</span>
      {formattedPercent && <span className={`${percentClass} font-bold ml-1.5`}>{formattedPercent}</span>}
    </>
  );
};

// ================== Stat Card ==================

interface StatCardProps {
  label: string;
  value: string;
  caption?: React.ReactNode;
}

const StatCard = ({ label, value, caption }: StatCardProps) => (
  <Card>
    <CardContent>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {caption == null ? null : <div className="text-sm mt-1">{caption}</div>}
    </CardContent>
  </Card>
);

// ================== Collapsible Positions ==================

const CollapsiblePositions = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.positions')}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
};

// ================== Collapsible Realized Gains ==================

interface CollapsibleRealizedGainsProps {
  realizedSales: RealizedSale[];
  locale: string;
}

const CollapsibleRealizedGains = ({ realizedSales, locale }: CollapsibleRealizedGainsProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.realizedGains')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <RealizedGainsTable realizedSales={realizedSales} locale={locale} />
      </CollapsibleContent>
    </Collapsible>
  );
};

// ================== Collapsible Dividends Received ==================

interface CollapsibleDividendsReceivedProps {
  dividendsReceived: DividendReceived[];
  displayCurrency: 'EUR' | 'USD';
  locale: string;
}

const CollapsibleDividendsReceived = ({ dividendsReceived, displayCurrency, locale }: CollapsibleDividendsReceivedProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.dividendsReceived')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <DividendsReceivedTable dividendsReceived={dividendsReceived} displayCurrency={displayCurrency} locale={locale} />
      </CollapsibleContent>
    </Collapsible>
  );
};

// ================== Collapsible Withdrawals Section ==================

interface CollapsibleWithdrawalsSectionProps {
  status: PricedPortfolioStatus;
  locale: string;
}

const CollapsibleWithdrawalsSection = ({ status, locale }: CollapsibleWithdrawalsSectionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.withdrawals')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <WithdrawalsTable
          realizedWithdrawals={status.realized_withdrawals}
          locale={locale}
          principalEur={status.principal_eur}
          dividendsEur={status.dividends_eur}
          taxRate={status.capital_gains_tax_rate}
        />
      </CollapsibleContent>
    </Collapsible>
  );
};

// ================== Reusable content component ==================

interface PortfolioStatusContentProps {
  status: PricedPortfolioStatus;
  performance?: PortfolioPerformance;
  isPerformanceLoading: boolean;
  isAllocationLoading?: boolean;
  isEmptyPortfolio?: boolean;
  toolbar?: React.ReactNode;
}

const PortfolioStatusContent = ({
  status,
  performance,
  isPerformanceLoading,
  isAllocationLoading = false,
  isEmptyPortfolio = false,
  toolbar,
}: PortfolioStatusContentProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { goToTransactions } = useNavigation();
  const { currency } = useCurrencyPreference();
  const showEur = currency === 'EUR';
  const eur = useMemo(() => computeEurMetrics(status), [status]);
  const liveLastPoint = useMemo(
    () => status.current_value == null
      ? undefined
      : { currentValue: status.current_value, fxRate: status.usd_to_eur_rate },
    [status.current_value, status.usd_to_eur_rate],
  );

  // Compute EUR-adjusted TWR % (same formula as chart) for "All" period
  const lastReturnPct = useMemo(() => {
    const points = performance?.data_points;
    if (!points || points.length < 2) return null;
    const last = points[points.length - 1];
    if (last.return_pct == null) return null;

    if (!showEur) return last.return_pct;

    // EUR adjustment: (1 + return%) × current_fx / ((1 + first_return%) × first_fx) - 1
    const liveFx = status.usd_to_eur_rate;
    const effectiveFxLast = liveFx ?? last.fx_rate;
    const first = points.find(p => p.return_pct != null && p.fx_rate != null);
    if (first?.return_pct == null || first?.fx_rate == null || effectiveFxLast == null) return last.return_pct;
    const baseFactor = (1 + first.return_pct / 100) * first.fx_rate;
    if (baseFactor <= 0) return null;
    const lastFactor = (1 + last.return_pct / 100) * effectiveFxLast;
    return (lastFactor / baseFactor - 1) * 100;
  }, [performance, showEur, status.usd_to_eur_rate]);

  // Compute annualized return from the EUR-adjusted TWR
  const annualizedReturn = useMemo(() => {
    if (lastReturnPct == null) return null;
    const points = performance?.data_points;
    if (!points || points.length < 2) return null;
    const firstDate = new Date(points[0].date);
    const lastDate = new Date(points[points.length - 1].date);
    const days = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / 86_400_000);
    if (days < 30) return null;
    const twr = lastReturnPct / 100;
    return (Math.pow(1 + twr, 365 / days) - 1) * 100;
  }, [performance, lastReturnPct]);

  if (isEmptyPortfolio) {
    return (
      <Card>
        <CardContent>
          {toolbar && <div className="flex justify-end mb-4">{toolbar}</div>}
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              <span>{t('status.emptyPortfolio')}{' '}
              <button type="button" className="underline font-medium cursor-pointer" onClick={goToTransactions}>{t('status.emptyPortfolioLink')}</button>.</span>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Resolve display values based on currency
  const totalValue = showEur ? (eur?.currentValueEur ?? null) : status.current_value;
  const netInvested = showEur ? status.principal_eur : status.principal;
  const eurRate = eur?.rate ?? null;
  // Total return = current value - net invested (consistent with chart header)
  const totalReturn = totalValue == null
    ? null
    : totalValue - netInvested;

  // After-tax value: total value minus estimated capital gains tax
  const estimatedTax = (() => {
    if (totalValue == null) return null;
    if (showEur) return eur?.taxEur ?? null;
    const capitalGains = totalValue - status.principal - status.dividends;
    return capitalGains > 0 ? capitalGains * status.capital_gains_tax_rate : 0;
  })();
  const afterTaxValue = totalValue != null && estimatedTax != null
    ? totalValue - estimatedTax
    : null;
  const taxRatePct = (status.capital_gains_tax_rate * 100).toFixed(1).replace(/\.0$/, '');

  // FX impact caption for Net Invested (EUR mode)
  const fxImpact = showEur ? (eur?.currencyGainsEur ?? null) : null;
  const fxImpactPct = showEur ? (eur?.currencyGainsPct ?? null) : null;

  return (
    <>
      {/* Toolbar */}
      {toolbar && <div className="flex justify-end">{toolbar}</div>}

      {/* Transaction Warnings */}
      {status.warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">{t('status.transactionWarnings')}</p>
            <ul className="list-disc pl-4 mt-1 text-sm">
              {status.warnings.map((w: TransactionWarning) => (
                <li key={`${w.code}-${w.date}`}>
                  {(t as (key: string, options?: Record<string, unknown>) => string)(`status.warnings.${w.code}`, {
                    ...w.params,
                    date: formatDateTime(w.date, locale),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('status.netInvested')}
          value={formatCurrency(netInvested, currency, locale)}
          caption={
            fxImpact == null ? undefined : (
              <p className={getValueClass(fxImpact)}>
                {formatCurrencyWithPercent(fxImpact, fxImpactPct, 'EUR', locale)}
                <span className="text-muted-foreground ml-1">{t('status.fxImpact')}</span>
              </p>
            )
          }
        />
        <StatCard
          label={t('status.totalReturn')}
          value={totalReturn == null ? '-' : formatSignedCurrency(totalReturn, currency, locale)}
          caption={
            annualizedReturn == null ? undefined : (
              <p className={`${getValueClass(annualizedReturn)} font-medium`}>
                {formatSignedPercent(annualizedReturn)} {t('status.annualized').toLowerCase()}
              </p>
            )
          }
        />
        <StatCard
          label={t('status.afterTaxValue')}
          value={afterTaxValue == null ? '-' : formatCurrency(afterTaxValue, currency, locale)}
          caption={
            estimatedTax == null ? undefined : (
              <p className="text-muted-foreground">
                {t('status.estTax', { rate: taxRatePct })}: −{formatCurrency(estimatedTax, currency, locale)}
              </p>
            )
          }
        />
      </div>

      {/* Charts Section */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
            <Skeleton className="h-[340px] w-full rounded-lg" />
            <Skeleton className="h-[340px] w-full rounded-lg" />
          </div>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
          <PerformanceChart
            data={performance?.data_points ?? EMPTY_DATA_POINTS}
            isLoading={isPerformanceLoading}
            currency={currency}
            liveLastPoint={liveLastPoint}
          />
          <HoldingsAllocationChart
            holdings={status.holdings}
            cash={status.cash}
            eurRate={eurRate}
            displayCurrency={currency}
            isLoading={isAllocationLoading}
          />
        </div>
      </Suspense>

      {/* Holdings Table */}
      <CollapsiblePositions>
        <HoldingsTable
          holdings={status.holdings}
          missingPrices={status.missing_prices}
          cash={status.cash}
          displayCurrency={currency}
          showEur={showEur}
          eurMetrics={eur}
          locale={locale}
        />
      </CollapsiblePositions>

      {/* Realized Gains */}
      {status.realized_sales.length > 0 && (
        <CollapsibleRealizedGains
          realizedSales={status.realized_sales}
          locale={locale}
        />
      )}

      {/* Dividends Received */}
      {status.dividends_received.length > 0 && (
        <CollapsibleDividendsReceived
          dividendsReceived={status.dividends_received}
          displayCurrency={currency}
          locale={locale}
        />
      )}

      {/* Withdrawals & Taxes */}
      {status.realized_withdrawals.length > 0 && (
        <CollapsibleWithdrawalsSection
          status={status}
          locale={locale}
        />
      )}
    </>
  );
};

// ================== Loading skeleton ==================

const PortfolioStatusSkeleton = () => (
  <div className="space-y-4">
    {/* Stat cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
      <Skeleton className="h-[340px] w-full rounded-lg" />
      <Skeleton className="h-[340px] w-full rounded-lg" />
    </div>

    {/* Holdings table */}
    <Card>
      <CardContent>
        <Skeleton className="h-8 w-full mb-2 rounded" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-full mb-1 rounded" />
        ))}
      </CardContent>
    </Card>
  </div>
);

// ================== Main view with data fetching ==================

export const PortfolioStatusView = () => {
  const { activePortfolioId: portfolioId } = useNavigation();
  const { t } = useTranslation();
  const locale = useLocale();

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: status, isLoading, error, dataUpdatedAt } = usePortfolioStatus(portfolioId);

  // Live price polling — computes priced status from transaction-derived status + live prices
  const tickers = useMemo(() => Array.from(new Set(status?.holdings.map((h) => h.ticker) ?? [])).sort((a, b) => a.localeCompare(b)), [status?.holdings]);
  const { data: livePrices, isFetching: isLivePricesFetching, dataUpdatedAt: livePricesUpdatedAt, error: livePricesError } = useLivePrices(
    tickers,
    !!status && tickers.length > 0,
  );
  const effectiveStatus = useMemo(() => {
    if (!status) return undefined;
    return computePricedStatus(status, livePrices ?? EMPTY_LIVE);
  }, [status, livePrices]);

  // Fetch full history — period filtering happens client-side in PerformanceChart
  const { data: performance, isLoading: isPerformanceLoading } = usePortfolioPerformance(
    portfolioId,
    undefined,
    undefined,
    365
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['portfolioStatus', portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ['portfolioPerformance', portfolioId] }),
        queryClient.invalidateQueries({ queryKey: ['livePrices'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!portfolioId) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <BriefcaseIcon />
          </EmptyMedia>
          <EmptyTitle>{t('status.noPortfolio')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return <PortfolioStatusSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangleIcon className="h-4 w-4" />
        <AlertDescription>{t('status.error', { message: getErrorMessage(error) })}</AlertDescription>
      </Alert>
    );
  }

  if (!effectiveStatus) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{t('status.noData')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const isEmptyPortfolio = effectiveStatus.holdings.length === 0
    && effectiveStatus.principal === 0
    && effectiveStatus.cash === 0
    && effectiveStatus.dividends === 0
    && effectiveStatus.realized_gains === 0
    && effectiveStatus.realized_sales.length === 0
    && effectiveStatus.dividends_received.length === 0
    && effectiveStatus.realized_withdrawals.length === 0;
  const latestUpdateAt = Math.max(dataUpdatedAt, livePricesUpdatedAt || 0);

  return (
    <div className="space-y-4">
      <PortfolioStatusContent
        status={effectiveStatus}
        performance={performance}
        isPerformanceLoading={isPerformanceLoading}
        isAllocationLoading={isLivePricesFetching && !livePrices}
        isEmptyPortfolio={isEmptyPortfolio}
        toolbar={
          <div className="flex items-center gap-2">
            {!isEmptyPortfolio && livePricesError && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangleIcon className="h-3.5 w-3.5" />
                {t('status.livePriceError')}
              </span>
            )}
            {!isEmptyPortfolio && latestUpdateAt > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {t('status.fetchedAt', {
                  time: new Date(latestUpdateAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                })}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label={t('status.refreshPortfolio')}
                >
                  <RefreshCwIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </span>
            )}
          </div>
        }
      />
    </div>
  );
};

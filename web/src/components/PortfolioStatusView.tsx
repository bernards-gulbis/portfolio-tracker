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
import { AlertTriangleIcon, ChevronRightIcon, InfoIcon, RefreshCwIcon } from 'lucide-react';
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

// ================== Collapsible Positions ==================

const CollapsiblePositions = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.positions')}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
};

// ================== Collapsible Financial Summary ==================

interface CollapsibleFinancialSummaryProps {
  netInvested: string;
  dividends: string;
  showEur: boolean;
  taxLabel: string;
  taxValue: string;
  taxCaption: React.ReactNode;
  afterTaxValue: string;
  afterTaxCaption: React.ReactNode;
}

const CollapsibleFinancialSummary = ({
  netInvested,
  dividends,
  showEur,
  taxLabel,
  taxValue,
  taxCaption,
  afterTaxValue,
  afterTaxCaption,
}: CollapsibleFinancialSummaryProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        <ChevronRightIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('status.financialSummary')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={`grid grid-cols-2 ${showEur ? 'sm:grid-cols-4' : 'sm:grid-cols-2'} gap-4 mt-4`}>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.netInvested')}</p>
            <p className="text-lg font-semibold">{netInvested}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.dividends')}</p>
            <p className="text-lg font-semibold">{dividends}</p>
          </div>
          {showEur && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{taxLabel}</p>
              <p className="text-lg font-semibold">{taxValue}</p>
              {taxCaption}
            </div>
          )}
          {showEur && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.afterTaxValue')}</p>
              <p className="text-lg font-semibold">{afterTaxValue}</p>
              {afterTaxCaption}
            </div>
          )}
        </div>
      </CollapsibleContent>
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
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
    <Collapsible open={open} onOpenChange={setOpen} className="mt-6">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
  const taxRate = useMemo(() =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      status.capital_gains_tax_rate * 100
    ), [locale, status.capital_gains_tax_rate]);
  const liveLastPoint = useMemo(
    () => status.current_value == null
      ? undefined
      : { currentValue: status.current_value, fxRate: status.usd_to_eur_rate },
    [status.current_value, status.usd_to_eur_rate],
  );

  if (isEmptyPortfolio) {
    return (
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
    );
  }

  // Resolve display values based on currency
  const marketValue = showEur ? (eur?.currentValueEur ?? null) : status.current_value;
  const unrealizedGains = showEur ? (eur?.unrealizedGainsEur ?? null) : status.unrealized_gains;
  const netInvested = showEur ? status.principal_eur : status.principal;
  const dividends = showEur ? status.dividends_eur : status.dividends;
  const taxEur = eur?.taxEur ?? null;
  const capitalGainsEur = eur?.capitalGainsEur ?? null;
  const afterTaxValue = eur?.currentValueAfterTaxEur ?? null;
  const totalReturnAfterTax = eur?.totalReturnAfterTaxEur ?? null;
  const eurRate = eur?.rate ?? null;

  return (
    <CardContent>
      {/* Toolbar + Market Value */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{t('status.marketValue')}</p>
          <p className="text-3xl font-bold">
            {marketValue === null ? '-' : formatCurrency(marketValue, currency, locale)}
          </p>
          <p className={`text-sm mt-1 ${getValueClass(unrealizedGains)}`}>
            {formatCurrencyWithPercent(
              unrealizedGains,
              status.unrealized_gains_pct,
              currency,
              locale
            )}
            <span className="text-muted-foreground ml-2 font-normal">{t('status.unrealized')}</span>
          </p>
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>

      {/* Transaction Warnings */}
      {status.warnings.length > 0 && (
        <Alert variant="destructive" className="mb-4">
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

      {/* Charts Section */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 mb-6">
            <Skeleton className="h-[340px] w-full rounded-lg" />
            <Skeleton className="h-[340px] w-full rounded-lg" />
          </div>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 mb-6">
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

      {/* Financial Summary (collapsed) */}
      <CollapsibleFinancialSummary
        netInvested={formatCurrency(netInvested, currency, locale)}
        dividends={dividends === null ? '-' : formatCurrency(dividends, currency, locale)}
        showEur={showEur}
        taxLabel={t('status.estTax', { rate: taxRate })}
        taxValue={taxEur === null ? '-' : formatCurrency(taxEur, 'EUR', locale)}
        taxCaption={
          capitalGainsEur !== null && taxEur !== null ? (
            <p className="text-xs mt-0.5 text-muted-foreground">
              {t('status.on')} {formatCurrency(capitalGainsEur, 'EUR', locale)}
            </p>
          ) : null
        }
        afterTaxValue={afterTaxValue === null ? '-' : formatCurrency(afterTaxValue, 'EUR', locale)}
        afterTaxCaption={
          <p className={`text-xs mt-0.5 ${getValueClass(totalReturnAfterTax)}`}>
            {formatSignedCurrency(totalReturnAfterTax, 'EUR', locale)}
          </p>
        }
      />

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

      {/* Withdrawals Table */}
      {status.realized_withdrawals.length > 0 && (
        <CollapsibleWithdrawalsSection
          status={status}
          locale={locale}
        />
      )}
    </CardContent>
  );
};

// ================== Loading skeleton ==================

const PortfolioStatusSkeleton = () => (
  <div className="mb-6 space-y-6">
    <Card>
      <CardContent>
        {/* Market Value header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-9 w-48 mb-1" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-5 w-32" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 mb-6">
          <Skeleton className="h-[340px] w-full rounded-lg" />
          <Skeleton className="h-[340px] w-full rounded-lg" />
        </div>

        {/* Holdings table */}
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
      <Card className="mb-6">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">{t('status.noPortfolio')}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <PortfolioStatusSkeleton />;
  }

  if (error) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8">
          <p className="text-center text-destructive">{t('status.error', { message: getErrorMessage(error) })}</p>
        </CardContent>
      </Card>
    );
  }

  if (!effectiveStatus) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">{t('status.noData')}</p>
        </CardContent>
      </Card>
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
    <div className="mb-6 space-y-6">
        <Card>
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
        </Card>
    </div>
  );
};

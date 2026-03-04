import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useLivePrices } from '../hooks/useLivePrices';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatSignedCurrency, formatSignedPercent, formatDateTime, getValueClass } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { getErrorMessage, PricedPortfolioStatus, PortfolioPerformance, PerformanceDataPoint, TransactionWarning, LivePrices } from '../api';
import { useCurrencyPreference, type Currency } from '../hooks/useCurrencyPreference';
import { computeEurMetrics } from '../utils/eurMetrics';
import { computePricedStatus } from '../utils/computePricedStatus';
import { HoldingsTable } from './HoldingsTable';
import { EditPortfolioModal } from './EditPortfolioModal';
import { CopyPortfolioModal } from './CopyPortfolioModal';
import { toast } from 'sonner';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreVertical, PencilIcon, CopyIcon, TrashIcon, Trash2Icon, AlertTriangleIcon, InfoIcon, RefreshCwIcon } from 'lucide-react';

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

// ================== Reusable content component ==================

interface PortfolioStatusContentProps {
  status: PricedPortfolioStatus;
  performance?: PortfolioPerformance;
  isPerformanceLoading: boolean;
  isEmptyPortfolio?: boolean;
  toolbar?: React.ReactNode;
}

const PortfolioStatusContent = ({
  status,
  performance,
  isPerformanceLoading,
  isEmptyPortfolio = false,
  toolbar,
}: PortfolioStatusContentProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { currency } = useCurrencyPreference();
  const showEur = currency === 'EUR';
  const eur = useMemo(() => showEur ? computeEurMetrics(status) : null, [status, showEur]);
  const taxRate = useMemo(() =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      status.capital_gains_tax_rate * 100
    ), [locale, status.capital_gains_tax_rate]);
  const liveLastPoint = useMemo(
    () => status.current_value != null
      ? { currentValue: status.current_value, fxRate: status.usd_to_eur_rate }
      : undefined,
    [status.current_value, status.usd_to_eur_rate],
  );

  if (isEmptyPortfolio) {
    return (
      <CardContent>
        {toolbar && <div className="flex justify-end mb-4">{toolbar}</div>}
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>{t('status.emptyPortfolio')}</AlertDescription>
        </Alert>
      </CardContent>
    );
  }

  // Resolve display values based on currency
  const marketValue = eur ? eur.currentValueEur : showEur ? null : status.current_value;
  const unrealizedGains = eur ? eur.unrealizedGainsEur : showEur ? null : status.unrealized_gains;
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
              {status.warnings.map((w: TransactionWarning, i: number) => (
                <li key={i}>
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

      {/* Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.netInvested')}</p>
          <p className="text-lg font-semibold">{formatCurrency(netInvested, currency, locale)}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.dividends')}</p>
          <p className="text-lg font-semibold">
            {dividends === null ? '-' : formatCurrency(dividends, currency, locale)}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.estTax', { rate: taxRate })}</p>
          <p className="text-lg font-semibold">
            {taxEur === null ? '-' : formatCurrency(taxEur, 'EUR', locale)}
          </p>
          {capitalGainsEur !== null && taxEur !== null && (
            <p className="text-xs mt-0.5 text-muted-foreground">
              {t('status.on')} {formatCurrency(capitalGainsEur, 'EUR', locale)}
            </p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.afterTaxValue')}</p>
          <p className="text-lg font-semibold">
            {afterTaxValue === null ? '-' : formatCurrency(afterTaxValue, 'EUR', locale)}
          </p>
          <p className={`text-xs mt-0.5 ${getValueClass(totalReturnAfterTax)}`}>
            {formatSignedCurrency(totalReturnAfterTax, 'EUR', locale)}
          </p>
        </div>
      </div>

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
            isLoading={false}
          />
        </div>
      </Suspense>

      {/* Holdings Table */}
      <HoldingsTable
        holdings={status.holdings}
        missingPrices={status.missing_prices}
        cash={status.cash}
        displayCurrency={currency}
        showEur={showEur}
        eurMetrics={eur}
        locale={locale}
      />
    </CardContent>
  );
};

// ================== Loading skeleton ==================

const PortfolioStatusSkeleton = () => (
  <div className="mb-6 space-y-6">
    <Card>
      <CardContent>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-48" />
      </CardContent>
    </Card>
  </div>
);

// ================== Main view with data fetching ==================

export const PortfolioStatusView = () => {
  const portfolioId = useActivePortfolioId();
  const { t } = useTranslation();
  const locale = useLocale();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const navigate = useNavigate();
  const deletePortfolio = useDeletePortfolio();

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: status, isLoading, error, dataUpdatedAt } = usePortfolioStatus(portfolioId);

  // Live price polling — computes priced status from transaction-derived status + live prices
  const tickers = useMemo(() => status?.holdings.map((h) => h.ticker) ?? [], [status?.holdings]);
  const { data: livePrices, dataUpdatedAt: livePricesUpdatedAt, error: livePricesError } = useLivePrices(
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

  const handleDeleteConfirm = async () => {
    if (portfolioId == null) return;
    try {
      await deletePortfolio.mutateAsync(portfolioId);
      await queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(t('portfolio.delete.errorToast', { message: getErrorMessage(err) }));
    } finally {
      setIsDeleteConfirmOpen(false);
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

  const isEmptyPortfolio = effectiveStatus.holdings.length === 0 && effectiveStatus.principal === 0;
  const latestUpdateAt = Math.max(dataUpdatedAt, livePricesUpdatedAt || 0);

  return (
    <>
      <div className="mb-6 space-y-6">
        <Card>
          <PortfolioStatusContent
            status={effectiveStatus}
            performance={performance}
            isPerformanceLoading={isPerformanceLoading}
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
                    >
                      <RefreshCwIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={t('portfolio.list.item.actionsLabel', { name: effectiveStatus.portfolio_name })}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
                        <PencilIcon />
                        {t('portfolio.list.item.rename')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsCopyModalOpen(true)}>
                        <CopyIcon />
                        {t('portfolio.list.item.copy')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        disabled={deletePortfolio.isPending}
                      >
                        <TrashIcon />
                        {t('portfolio.list.item.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />
        </Card>
      </div>

      <EditPortfolioModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        portfolioId={portfolioId}
        currentName={effectiveStatus.portfolio_name}
      />

      <CopyPortfolioModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        portfolioId={portfolioId}
        portfolioName={effectiveStatus.portfolio_name}
      />

      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => !open && setIsDeleteConfirmOpen(false)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('portfolio.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('portfolio.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">{t('portfolio.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              {t('portfolio.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatSignedCurrency, formatQuantity } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { getErrorMessage, PortfolioStatus, PortfolioPerformance } from '../api';
import { useCurrencyPreference } from '../hooks/useCurrencyPreference';
import { computeEurMetrics, applyRateToHolding } from '../utils/eurMetrics';
import EditPortfolioModal from './EditPortfolioModal';
import CopyPortfolioModal from './CopyPortfolioModal';
import { toast } from 'sonner';

const PerformanceChart = lazy(() =>
  import('./PerformanceChart').then((m) => ({ default: m.PerformanceChart }))
);
const HoldingsAllocationChart = lazy(() =>
  import('./HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart }))
);
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { MoreHorizontal, PencilIcon, CopyIcon, TrashIcon, Trash2Icon, AlertTriangleIcon, InfoIcon, XIcon, RefreshCwIcon } from 'lucide-react';


const formatSignedPercent = (value: number | null | undefined): string => {
  if (value == null) return '';
  const sign = value >= 0 ? '\u25B2' : '\u25BC';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'text-positive' : 'text-negative';
};

const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): JSX.Element | string => {
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
  status: PortfolioStatus;
  performance?: PortfolioPerformance;
  performanceLoading: boolean;
}

export const PortfolioStatusContent = ({
  status,
  performance,
  performanceLoading,
}: PortfolioStatusContentProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { currency, toggle } = useCurrencyPreference();
  const eurMetrics = computeEurMetrics(status);

  const showEur = currency === 'EUR';
  const eurAvailable = eurMetrics !== null;
  const taxRate = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    status.capital_gains_tax_rate * 100
  );

  // Resolve display values based on currency toggle
  const displayCurrency = showEur ? 'EUR' : 'USD';
  const marketValue = showEur ? (eurAvailable ? eurMetrics!.currentValueEur : null) : status.current_value;
  const unrealizedGains = showEur ? (eurAvailable ? eurMetrics!.unrealizedGainsEur : null) : status.unrealized_gains;
  const netInvested = showEur ? status.principal_eur : status.principal;
  const currencyGainsEur = showEur && eurAvailable ? eurMetrics!.currencyGainsEur : null;
  const currencyGainsPct = showEur && eurAvailable ? eurMetrics!.currencyGainsPct : null;
  const dividends = showEur ? status.dividends_eur : status.dividends;
  const taxEur = showEur && eurAvailable ? eurMetrics!.taxEur : null;
  const capitalGainsEur = showEur && eurAvailable ? eurMetrics!.capitalGainsEur : null;
  const afterTaxValue = showEur && eurAvailable ? eurMetrics!.currentValueAfterTaxEur : null;
  const totalReturnAfterTax = showEur && eurAvailable ? eurMetrics!.totalReturnAfterTaxEur : null;
  const cashDisplay = showEur && eurAvailable ? eurMetrics!.cashEur : status.cash;
  const eurRate = showEur && eurAvailable ? eurMetrics!.rate : null;

  return (
    <CardContent>
      {/* Currency Toggle */}
      <div className="flex items-center justify-end mb-4 gap-2">
        {showEur && !eurAvailable && (
          <span className="text-xs text-muted-foreground">{t('status.currency.eurUnavailable')}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-label={t('status.currency.toggle')}
          className="h-7 px-2 text-xs font-medium"
        >
          <span className={currency === 'USD' ? 'font-bold' : 'text-muted-foreground'}>
            {t('status.currency.usdLabel')}
          </span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className={currency === 'EUR' ? 'font-bold' : 'text-muted-foreground'}>
            {t('status.currency.eurLabel')}
          </span>
        </Button>
      </div>

      {/* Portfolio Value */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-1">{t('status.marketValue')}</p>
        <p className="text-3xl font-bold">
          {marketValue === null ? '-' : formatCurrency(marketValue, displayCurrency, locale)}
        </p>
        <p className={`text-sm mt-1 ${getValueClass(unrealizedGains)}`}>
          {formatCurrencyWithPercent(
            unrealizedGains,
            status.unrealized_gains_pct,
            displayCurrency,
            locale
          )}
          <span className="text-muted-foreground ml-2 font-normal">{t('status.unrealized')}</span>
        </p>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.netInvested')}</p>
          <p className="text-lg font-semibold">{formatCurrency(netInvested, displayCurrency, locale)}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.dividends')}</p>
          <p className="text-lg font-semibold">
            {dividends === null ? '-' : formatCurrency(dividends, displayCurrency, locale)}
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
            data={performance?.data_points || []}
            loading={performanceLoading}
            currency={currency}
            liveLastPoint={{
              currentValue: status.current_value,
              fxRate: status.usd_to_eur_rate,
              returnPct: status.principal > 0
                ? (status.current_value - status.principal) / status.principal * 100
                : null,
            }}
          />
          <HoldingsAllocationChart
            holdings={status.holdings}
            cash={status.cash}
            eurRate={eurRate}
            loading={false}
          />
        </div>
      </Suspense>

      {/* Holdings Table */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('status.positions')}</h3>
        {status.missing_prices.length > 0 && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertDescription>
              {t('status.missingPrices', { tickers: status.missing_prices.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('status.columns.ticker')}</TableHead>
                <TableHead>{t('status.columns.quantity')}</TableHead>
                <TableHead>
                  {t('status.columns.avgCost')}
                  {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
                </TableHead>
                <TableHead>
                  {t('status.columns.totalCost')}
                  {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
                </TableHead>
                <TableHead>
                  {t('status.columns.currentPrice')}
                  {showEur && <span className="ml-1 text-muted-foreground font-normal">USD</span>}
                </TableHead>
                <TableHead>
                  {t('status.columns.marketValue')}
                  {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
                </TableHead>
                <TableHead>
                  {t('status.columns.unrealizedGL')}
                  {showEur && eurAvailable && <span className="ml-1 text-muted-foreground font-normal">EUR</span>}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow key="CASH">
                <TableCell className="font-semibold">CASH</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell>
                  {formatCurrency(cashDisplay, displayCurrency, locale)}
                </TableCell>
                <TableCell>
                  {currencyGainsEur !== null ? (
                    <div className="flex flex-col">
                      <span className={`font-semibold ${getValueClass(currencyGainsEur)}`}>
                        {formatSignedCurrency(currencyGainsEur, 'EUR', locale)}
                      </span>
                      {currencyGainsPct !== null && (
                        <span className={`text-xs ${getValueClass(currencyGainsEur)}`}>
                          {currencyGainsPct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(currencyGainsPct).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  ) : '-'}
                </TableCell>
              </TableRow>
              {status.holdings.map((holding) => {
                const eurVals = showEur && eurAvailable ? applyRateToHolding(holding, eurMetrics!.rate) : null;
                return (
                  <TableRow key={holding.ticker}>
                    <TableCell className="font-semibold">{holding.ticker}</TableCell>
                    <TableCell>{formatQuantity(holding.quantity)}</TableCell>
                    {/* Avg cost — always USD */}
                    <TableCell>{formatCurrency(holding.average_cost, 'USD', locale)}</TableCell>
                    {/* Total cost — always USD */}
                    <TableCell>{formatCurrency(holding.total_cost, 'USD', locale)}</TableCell>
                    {/* Current price — always USD */}
                    <TableCell>
                      {holding.current_price == null ? '-' : formatCurrency(holding.current_price, 'USD', locale)}
                    </TableCell>
                    {/* Market value — EUR when EUR mode is active */}
                    <TableCell className="font-medium">
                      {eurVals != null
                        ? (eurVals.current_value_eur != null ? formatCurrency(eurVals.current_value_eur, 'EUR', locale) : '-')
                        : (holding.current_value == null ? '-' : formatCurrency(holding.current_value, 'USD', locale))}
                    </TableCell>
                    {/* Unrealized G/L — EUR when EUR mode is active */}
                    <TableCell>
                      {eurVals != null && eurVals.unrealized_gain_loss_eur != null && holding.unrealized_gain_loss_pct != null
                        ? (
                          <div className="flex flex-col">
                            <span className={`font-semibold ${getValueClass(eurVals.unrealized_gain_loss_eur)}`}>
                              {formatSignedCurrency(eurVals.unrealized_gain_loss_eur, 'EUR', locale)}
                            </span>
                            <span className={`text-xs ${getValueClass(eurVals.unrealized_gain_loss_eur)}`}>
                              {holding.unrealized_gain_loss_pct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(holding.unrealized_gain_loss_pct).toFixed(2)}%
                            </span>
                          </div>
                        )
                        : holding.unrealized_gain_loss != null && holding.unrealized_gain_loss_pct != null
                          ? (
                            <div className="flex flex-col">
                              <span className={`font-semibold ${getValueClass(holding.unrealized_gain_loss)}`}>
                                {formatSignedCurrency(holding.unrealized_gain_loss, 'USD', locale)}
                              </span>
                              <span className={`text-xs ${getValueClass(holding.unrealized_gain_loss)}`}>
                                {holding.unrealized_gain_loss_pct >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(holding.unrealized_gain_loss_pct).toFixed(2)}%
                              </span>
                            </div>
                          )
                          : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </CardContent>
  );
};

// ================== Loading skeleton ==================

export const PortfolioStatusSkeleton = () => (
  <div className="mb-6 space-y-6">
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4 mb-6">
          <Skeleton className="h-[340px] w-full rounded-lg" />
          <Skeleton className="h-[340px] w-full rounded-lg" />
        </div>
        <div>
          <Skeleton className="h-4 w-20 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

// ================== Main view with data fetching ==================

export const PortfolioStatusView = () => {
  const portfolioId = useActivePortfolioId();
  const { t } = useTranslation();
  const locale = useLocale();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emptyAlertDismissed, setEmptyAlertDismissed] = useState(false);

  const navigate = useNavigate();
  const deletePortfolio = useDeletePortfolio();

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: status, isLoading, error, dataUpdatedAt } = usePortfolioStatus(portfolioId);

  // Fetch full history — period filtering happens client-side in PerformanceChart
  const { data: performance, isLoading: performanceLoading } = usePortfolioPerformance(
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
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (portfolioId == null) return;
    try {
      await deletePortfolio.mutateAsync(portfolioId);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(t('portfolio.delete.errorToast', { message: getErrorMessage(err) }));
    } finally {
      setDeleteConfirmOpen(false);
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

  if (!status) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">{t('status.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const isEmptyPortfolio = status.holdings.length === 0 && status.principal === 0;

  return (
    <>
      {isEmptyPortfolio && !emptyAlertDismissed && (
        <Alert className="mb-6">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{t('status.emptyPortfolio')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setEmptyAlertDismissed(true)}
              aria-label={t('portfolio.delete.cancel')}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="mb-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{status.portfolio_name}</CardTitle>
            {dataUpdatedAt > 0 && (
              <CardDescription className="flex items-center gap-1.5">
                {t('status.fetchedAt', {
                  time: new Date(dataUpdatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
              </CardDescription>
            )}
            <CardAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('portfolio.list.item.actionsLabel', { name: status.portfolio_name })}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setEditModalOpen(true)}>
                      <PencilIcon />
                      {t('portfolio.list.item.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCopyModalOpen(true)}>
                      <CopyIcon />
                      {t('portfolio.list.item.copy')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={deletePortfolio.isPending}
                    >
                      <TrashIcon />
                      {t('portfolio.list.item.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardAction>
          </CardHeader>
          <PortfolioStatusContent
            status={status}
            performance={performance}
            performanceLoading={performanceLoading}
          />
        </Card>
      </div>

      <EditPortfolioModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        portfolioId={portfolioId}
        currentName={status.portfolio_name}
      />

      <CopyPortfolioModal
        isOpen={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        portfolioId={portfolioId}
        portfolioName={status.portfolio_name}
      />

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => !open && setDeleteConfirmOpen(false)}
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

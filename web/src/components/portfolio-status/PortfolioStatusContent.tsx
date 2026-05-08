import React, { useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  getValueClass,
  formatTaxRatePercent,
} from '../../utils/formatters';
import { useLocale } from '../../hooks/useLocale';
import { useCurrencyPreference } from '../../hooks/useCurrencyPreference';
import { computeEurMetrics } from '../../utils/eurMetrics';
import {
  getErrorMessage,
  type PerformanceDataPoint,
  type PortfolioPerformance,
  type PricedPortfolioStatus,
} from '../../api';

import { ErrorBoundary } from '../ErrorBoundary';
import { HoldingsTable } from '../HoldingsTable';
import { RealizedGainsTable, DividendsReceivedTable } from '../RealizedGainsTable';
import { WithdrawalsTable } from '../WithdrawalsTable';

import { useDismissedCostBasisWarning } from '../../hooks/useDismissedCostBasisWarning';

import { CollapsibleSection } from './CollapsibleSection';
import { EurIncompleteBanner } from './EurIncompleteBanner';
import { InfoBanner } from './InfoBanner';
import { StatCard } from './StatCard';
import { WarningsAlert } from './WarningsAlert';
import { computeDisplayFigures } from './displayFigures';
import { formatCurrencyWithPercent } from './formatCurrencyWithPercent';
import { useDerivedReturns } from './useDerivedReturns';

const PerformanceChart = lazy(() =>
  import('../PerformanceChart').then((m) => ({ default: m.PerformanceChart })),
);
const HoldingsAllocationChart = lazy(() =>
  import('../HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart })),
);

const EMPTY_DATA_POINTS: PerformanceDataPoint[] = [];
const chartFallback = <Skeleton className="h-[340px] w-full rounded-lg" />;

export interface PortfolioStatusContentProps {
  status: PricedPortfolioStatus;
  performance?: PortfolioPerformance;
  performanceError?: Error | null;
  isPerformanceLoading: boolean;
  isAllocationLoading?: boolean;
  isEmptyPortfolio?: boolean;
  /** True when the upstream price provider's circuit breaker is open.
   *  Surfaces a single banner explaining why so many tickers may show
   *  ``last_known``/``missing`` badges at once. */
  providerUnavailable?: boolean;
  toolbar?: React.ReactNode;
}

export const PortfolioStatusContent = ({
  status,
  performance,
  performanceError,
  isPerformanceLoading,
  isAllocationLoading = false,
  isEmptyPortfolio = false,
  providerUnavailable = false,
  toolbar,
}: PortfolioStatusContentProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const { id: idParam } = useParams<{ id: string }>();
  const goToTransactions = () => {
    if (idParam) navigate(`/portfolios/${idParam}/transactions`);
  };
  const { currency } = useCurrencyPreference();
  const showEur = currency === 'EUR';
  const eur = useMemo(() => computeEurMetrics(status), [status]);
  const liveLastPoint = useMemo(
    () =>
      status.current_value == null
        ? undefined
        : { currentValue: status.current_value, fxRate: status.usd_to_eur_rate },
    [status.current_value, status.usd_to_eur_rate],
  );

  const { annualizedReturn } = useDerivedReturns(performance, status, showEur);

  const { shouldShow: showCostBasisWarning, dismiss: dismissCostBasisWarning } =
    useDismissedCostBasisWarning(
      performance?.portfolio_id ?? 0,
      performance?.cost_basis_fallback_tickers ?? [],
    );

  if (isEmptyPortfolio) {
    return (
      <Card>
        <CardContent>
          {toolbar && <div className="flex justify-end mb-4">{toolbar}</div>}
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              <span>
                {t('status.emptyPortfolio')}{' '}
                <Link
                  to={idParam ? `/portfolios/${idParam}/transactions` : '#'}
                  className="underline font-medium cursor-pointer"
                >
                  {t('status.emptyPortfolioLink')}
                </Link>
                .
              </span>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { netInvested, totalReturn, estimatedTax, afterTaxValue, fxImpact, fxImpactPct } =
    computeDisplayFigures(status, eur, currency);
  const eurRate = eur?.rate ?? null;

  const fxCaption = fxImpact == null ? undefined : (
    <p className={getValueClass(fxImpact)}>
      {formatCurrencyWithPercent(fxImpact, fxImpactPct, 'EUR', locale)}
      <span className="text-muted-foreground ml-1">{t('status.fxImpact')}</span>
    </p>
  );

  const annualizedCaption = annualizedReturn == null ? undefined : (
    <p className={`${getValueClass(annualizedReturn)} font-medium`}>
      {formatSignedPercent(annualizedReturn)} {t('status.annualized').toLowerCase()}
    </p>
  );

  const taxCaption = estimatedTax == null ? undefined : (
    <p className="text-muted-foreground inline-flex items-center gap-1">
      <span>
        {t('status.estTax', { rate: formatTaxRatePercent(status.capital_gains_tax_rate) })}: −
        {formatCurrency(estimatedTax, currency, locale)}
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon
              aria-label={t('status.estTaxFlatTooltip')}
              className="h-3.5 w-3.5 text-muted-foreground cursor-help"
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            <p>{t('status.estTaxFlatTooltip')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </p>
  );

  return (
    <>
      {toolbar && <div className="flex justify-end">{toolbar}</div>}

      {status.eur_incomplete && status.fx_missing_tx_ids.length > 0 && (
        <EurIncompleteBanner
          missingCount={status.fx_missing_tx_ids.length}
          onGoToTransactions={goToTransactions}
        />
      )}

      {providerUnavailable && <InfoBanner>{t('status.providerUnavailable')}</InfoBanner>}

      <WarningsAlert warnings={status.warnings} locale={locale} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('status.netInvested')}
          value={netInvested == null ? '-' : formatCurrency(netInvested, currency, locale)}
          caption={fxCaption}
        />
        <StatCard
          label={t('status.totalReturn')}
          value={totalReturn == null ? '-' : formatSignedCurrency(totalReturn, currency, locale)}
          caption={annualizedCaption}
        />
        <StatCard
          label={t('status.afterTaxValue')}
          value={afterTaxValue == null ? '-' : formatCurrency(afterTaxValue, currency, locale)}
          caption={taxCaption}
        />
      </div>

      {showCostBasisWarning && (
        <InfoBanner onDismiss={dismissCostBasisWarning}>
          {t('status.chartCostBasisFallback', {
            tickers: performance!.cost_basis_fallback_tickers.join(', '),
          })}
        </InfoBanner>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        {performanceError == null ? (
          <ErrorBoundary fullScreen={false}>
            <Suspense fallback={chartFallback}>
              <PerformanceChart
                data={performance?.data_points ?? EMPTY_DATA_POINTS}
                isLoading={isPerformanceLoading}
                currency={currency}
                liveLastPoint={liveLastPoint}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <Card>
            <CardContent>
              <Alert variant="destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertDescription>
                  {t('chart.performance.loadError', { message: getErrorMessage(performanceError) })}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}
        <ErrorBoundary fullScreen={false}>
          <Suspense fallback={chartFallback}>
            <HoldingsAllocationChart
              holdings={status.holdings}
              cash={status.cash}
              eurRate={eurRate}
              displayCurrency={currency}
              isLoading={isAllocationLoading}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <CollapsibleSection title={t('status.positions')} defaultOpen>
        <ErrorBoundary fullScreen={false}>
          <HoldingsTable
            holdings={status.holdings}
            missingPrices={status.missing_prices}
            cash={status.cash}
            displayCurrency={currency}
            showEur={showEur}
            eurMetrics={eur}
            locale={locale}
          />
        </ErrorBoundary>
      </CollapsibleSection>

      {status.realized_sales.length > 0 && (
        <CollapsibleSection
          title={t('status.realizedGains')}
          secondary={`(${t('status.realizedGainsMethod')})`}
        >
          <ErrorBoundary fullScreen={false}>
            <RealizedGainsTable realizedSales={status.realized_sales} locale={locale} />
          </ErrorBoundary>
        </CollapsibleSection>
      )}

      {status.dividends_received.length > 0 && (
        <CollapsibleSection title={t('status.dividendsReceived')}>
          <ErrorBoundary fullScreen={false}>
            <DividendsReceivedTable
              dividendsReceived={status.dividends_received}
              displayCurrency={currency}
              locale={locale}
            />
          </ErrorBoundary>
        </CollapsibleSection>
      )}

      {status.realized_withdrawals.length > 0 && (
        <CollapsibleSection title={t('status.withdrawals')}>
          <ErrorBoundary fullScreen={false}>
            <WithdrawalsTable
              realizedWithdrawals={status.realized_withdrawals}
              locale={locale}
              principalEur={status.principal_eur}
              dividendsEur={status.dividends_eur}
              taxRate={status.capital_gains_tax_rate}
            />
          </ErrorBoundary>
        </CollapsibleSection>
      )}
    </>
  );
};

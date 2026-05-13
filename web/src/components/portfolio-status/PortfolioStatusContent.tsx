import React, { useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { formatCurrency } from '../../utils/formatters';
import { useLocale } from '../../hooks/useLocale';
import { useCurrencyPreference } from '../../hooks/useCurrencyPreference';
import {
  computeEurMetrics,
  dayChangeFromHoldings,
  vsSpPoints,
} from '../../utils/eurMetrics';
import {
  getErrorMessage,
  type PerformanceDataPoint,
  type PortfolioPerformance,
  type PricedPortfolioStatus,
} from '../../api';

import { ErrorBoundary } from '../ErrorBoundary';
import { HoldingsTable } from '../HoldingsTable';

import { CollapsibleSection } from './CollapsibleSection';
import { EurIncompleteBanner } from './EurIncompleteBanner';
import { HeroPortfolioCard } from './HeroPortfolioCard';
import type { SparklinePoint } from './HeroSparkline';
import { HistorySection } from './HistorySection';
import { InfoBanner } from './InfoBanner';
import { WarningsAlert } from './WarningsAlert';
import { computeDisplayFigures } from './displayFigures';
import { useDerivedReturns } from './useDerivedReturns';

const SPARKLINE_MAX_POINTS = 30;

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

  const chartWarnings = useMemo(() => {
    const tickers = performance?.cost_basis_fallback_tickers ?? [];
    if (tickers.length === 0) return [];
    return [t('status.chartCostBasisFallback', { tickers: tickers.join(', ') })];
  }, [performance?.cost_basis_fallback_tickers, t]);

  const eurRate = eur?.rate ?? null;

  // % is rate-invariant; only the absolute delta is converted to EUR.
  const dayChange = useMemo(() => {
    const usdDayChange = dayChangeFromHoldings(status.holdings);
    if (usdDayChange == null) return null;
    if (currency === 'USD' || eurRate == null) return usdDayChange;
    return { ...usdDayChange, usd: usdDayChange.usd * eurRate };
  }, [status.holdings, currency, eurRate]);

  const inceptionYear = useMemo<number | null>(() => {
    const points = performance?.data_points;
    if (points && points.length > 0) return Number(points[0].date.slice(0, 4)) || null;
    const years = [
      ...status.holdings.map((h) => h.first_buy_date),
      ...status.realized_sales.map((s) => s.first_buy_date),
    ]
      .filter((d): d is string => typeof d === 'string' && d.length >= 4)
      .map((d) => Number(d.slice(0, 4)))
      .filter((y) => Number.isFinite(y) && y > 0);
    if (years.length === 0) return null;
    return Math.min(...years);
  }, [performance, status.holdings, status.realized_sales]);

  const sparklineData = useMemo<SparklinePoint[]>(() => {
    const points = performance?.data_points;
    if (points == null || points.length === 0) return [];
    const useEur = currency === 'EUR';
    const trimmed = points.slice(-SPARKLINE_MAX_POINTS);
    return trimmed
      .map((p) => {
        const raw = useEur && p.fx_rate != null && p.current_value != null
          ? p.current_value * p.fx_rate
          : p.current_value;
        return raw == null ? null : { date: p.date, value: raw };
      })
      .filter((p): p is SparklinePoint => p != null);
  }, [performance, currency]);

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

  const {
    totalValue,
    netInvested,
    totalReturn,
    estimatedTax,
    afterTaxValue,
    fxImpact,
    fxImpactPct,
  } = computeDisplayFigures(status, eur, currency);

  const latestDataPoint = performance?.data_points.at(-1);
  const vsSpPts = vsSpPoints(latestDataPoint);

  const hasHistory =
    status.realized_sales.length > 0 ||
    status.dividends_received.length > 0 ||
    status.realized_withdrawals.length > 0;

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

      <HeroPortfolioCard
        portfolioValue={totalValue}
        displayCurrency={currency}
        locale={locale}
        dayChange={dayChange}
        netInvested={netInvested}
        totalReturn={totalReturn}
        annualizedReturn={annualizedReturn}
        vsSpPts={vsSpPts}
        afterTaxValue={afterTaxValue}
        estimatedTax={estimatedTax}
        taxRate={status.capital_gains_tax_rate}
        fxImpact={fxImpact}
        fxImpactPct={fxImpactPct}
        inceptionYear={inceptionYear}
        sparklineData={sparklineData}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        {performanceError == null ? (
          <ErrorBoundary fullScreen={false}>
            <Suspense fallback={chartFallback}>
              <PerformanceChart
                data={performance?.data_points ?? EMPTY_DATA_POINTS}
                isLoading={isPerformanceLoading}
                currency={currency}
                liveLastPoint={liveLastPoint}
                warnings={chartWarnings}
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

      <CollapsibleSection
        title={t('status.positions')}
        summary={t('status.holdingsCount', {
          count: status.holdings.length,
          total: totalValue == null ? '—' : formatCurrency(totalValue, currency, locale),
        })}
        defaultOpen
      >
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

      {hasHistory && (
        <HistorySection
          realizedSales={status.realized_sales}
          dividendsReceived={status.dividends_received}
          realizedWithdrawals={status.realized_withdrawals}
          displayCurrency={currency}
          locale={locale}
          principalEur={status.principal_eur}
          dividendsEur={status.dividends_eur}
          taxRate={status.capital_gains_tax_rate}
        />
      )}
    </>
  );
};

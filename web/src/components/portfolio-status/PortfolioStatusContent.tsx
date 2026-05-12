import React, { useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { formatCurrency, formatSignedCurrency, getValueClass } from '../../utils/formatters';
import type { Currency } from '../../hooks/useCurrencyPreference';
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
import { RealizedGainsTable, DividendsReceivedTable } from '../RealizedGainsTable';
import { WithdrawalsTable } from '../WithdrawalsTable';

import { useDismissedCostBasisWarning } from '../../hooks/useDismissedCostBasisWarning';

import { CollapsibleSection } from './CollapsibleSection';
import { EurIncompleteBanner } from './EurIncompleteBanner';
import { HeroPortfolioCard } from './HeroPortfolioCard';
import { InfoBanner } from './InfoBanner';
import { WarningsAlert } from './WarningsAlert';
import { computeDisplayFigures } from './displayFigures';
import { useDerivedReturns } from './useDerivedReturns';

const PerformanceChart = lazy(() =>
  import('../PerformanceChart').then((m) => ({ default: m.PerformanceChart })),
);
const HoldingsAllocationChart = lazy(() =>
  import('../HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart })),
);

const EMPTY_DATA_POINTS: PerformanceDataPoint[] = [];
const chartFallback = <Skeleton className="h-[340px] w-full rounded-lg" />;

const renderCountTotal = (
  total: number,
  count: number,
  i18nKey: string,
  t: TFunction,
  currency: Currency,
  locale: string,
): React.ReactNode => {
  // Cast loses i18next typegen's key union so we can pass interpolated keys through.
  const tDynamic = t as unknown as (
    key: string,
    opts?: { total: string; count: number },
  ) => string;
  const totalText = formatSignedCurrency(total, currency, locale);
  return (
    <span className={getValueClass(total)}>
      {tDynamic(i18nKey, { total: totalText, count })}
    </span>
  );
};

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

  const eurRate = eur?.rate ?? null;

  // % is rate-invariant; only the absolute delta is converted to EUR.
  const dayChange = useMemo(() => {
    const usdDayChange = dayChangeFromHoldings(status.holdings);
    if (usdDayChange == null) return null;
    if (currency === 'USD' || eurRate == null) return usdDayChange;
    return { ...usdDayChange, usd: usdDayChange.usd * eurRate };
  }, [status.holdings, currency, eurRate]);

  const realizedGainsTotal = useMemo(
    () => status.realized_sales.reduce((sum, s) => sum + s.realized_gain, 0),
    [status.realized_sales],
  );
  const dividendsTotal = useMemo(
    () => status.dividends_received.reduce((sum, d) => sum + d.amount, 0),
    [status.dividends_received],
  );
  const withdrawalsTotal = useMemo(
    () => status.realized_withdrawals.reduce((sum, w) => sum + w.amount, 0),
    [status.realized_withdrawals],
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

  // Summary chips stay in USD because per-row EUR conversion needs historical
  // FX rates (already shown inside the expanded section tables).
  const realizedSummary = renderCountTotal(
    realizedGainsTotal,
    status.realized_sales.length,
    'status.realizedGainsSummary',
    t,
    'USD',
    locale,
  );
  const dividendsSummary = renderCountTotal(
    dividendsTotal,
    status.dividends_received.length,
    'status.dividendsSummary',
    t,
    'USD',
    locale,
  );
  const withdrawalsSummary = renderCountTotal(
    -Math.abs(withdrawalsTotal),
    status.realized_withdrawals.length,
    'status.withdrawalsSummary',
    t,
    'USD',
    locale,
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
      />

      {showCostBasisWarning && (
        <InfoBanner onDismiss={dismissCostBasisWarning}>
          {t('status.chartCostBasisFallback', {
            tickers: (performance?.cost_basis_fallback_tickers ?? []).join(', '),
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

      {status.realized_sales.length > 0 && (
        <CollapsibleSection
          title={t('status.realizedGains')}
          secondary={`(${t('status.realizedGainsMethod')})`}
          summary={realizedSummary}
          defaultOpen
        >
          <ErrorBoundary fullScreen={false}>
            <RealizedGainsTable realizedSales={status.realized_sales} locale={locale} />
          </ErrorBoundary>
        </CollapsibleSection>
      )}

      {status.dividends_received.length > 0 && (
        <CollapsibleSection
          title={t('status.dividendsReceived')}
          summary={dividendsSummary}
          defaultOpen
        >
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
        <CollapsibleSection
          title={t('status.withdrawals')}
          summary={withdrawalsSummary}
          defaultOpen
        >
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

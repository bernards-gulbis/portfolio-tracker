import React, { useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

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

import { HoldingsTable } from '../HoldingsTable';
import { RealizedGainsTable, DividendsReceivedTable } from '../RealizedGainsTable';
import { WithdrawalsTable } from '../WithdrawalsTable';

import { CollapsibleSection } from './CollapsibleSection';
import { EurIncompleteBanner } from './EurIncompleteBanner';
import { StatCard } from './StatCard';
import { WarningsAlert } from './WarningsAlert';
import { computeDisplayFigures } from './displayFigures';
import { formatCurrencyWithPercent } from './formatCurrencyWithPercent';
import { useDerivedReturns } from './useDerivedReturns';

const PerformanceChart = lazy(() =>
  import('../PerformanceChart').then((m) => ({ default: m.PerformanceChart }))
);
const HoldingsAllocationChart = lazy(() =>
  import('../HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart }))
);

const EMPTY_DATA_POINTS: PerformanceDataPoint[] = [];

export interface PortfolioStatusContentProps {
  status: PricedPortfolioStatus;
  performance?: PortfolioPerformance;
  performanceError?: Error | null;
  isPerformanceLoading: boolean;
  isAllocationLoading?: boolean;
  isEmptyPortfolio?: boolean;
  toolbar?: React.ReactNode;
}

export const PortfolioStatusContent = ({
  status,
  performance,
  performanceError,
  isPerformanceLoading,
  isAllocationLoading = false,
  isEmptyPortfolio = false,
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
                <button
                  type="button"
                  className="underline font-medium cursor-pointer"
                  onClick={goToTransactions}
                >
                  {t('status.emptyPortfolioLink')}
                </button>
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
  const taxRatePct = formatTaxRatePercent(status.capital_gains_tax_rate);

  return (
    <>
      {/* Toolbar */}
      {toolbar && <div className="flex justify-end">{toolbar}</div>}

      {/* EUR-incomplete banner — non-destructive: data is correct, just missing
          some FX rates the user can supply by editing transactions. Both
          conditions checked: defends against ``eur_incomplete=true`` with an
          empty id list (would render "0 missing rates"). */}
      {status.eur_incomplete && status.fx_missing_tx_ids.length > 0 && (
        <EurIncompleteBanner
          missingCount={status.fx_missing_tx_ids.length}
          onGoToTransactions={goToTransactions}
        />
      )}

      {/* Transaction Warnings */}
      <WarningsAlert warnings={status.warnings} locale={locale} />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('status.netInvested')}
          value={netInvested == null ? '-' : formatCurrency(netInvested, currency, locale)}
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
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        {performanceError == null ? (
          <Suspense fallback={<Skeleton className="h-[340px] w-full rounded-lg" />}>
            <PerformanceChart
              data={performance?.data_points ?? EMPTY_DATA_POINTS}
              isLoading={isPerformanceLoading}
              currency={currency}
              liveLastPoint={liveLastPoint}
            />
          </Suspense>
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
        <Suspense fallback={<Skeleton className="h-[340px] w-full rounded-lg" />}>
          <HoldingsAllocationChart
            holdings={status.holdings}
            cash={status.cash}
            eurRate={eurRate}
            displayCurrency={currency}
            isLoading={isAllocationLoading}
          />
        </Suspense>
      </div>

      {/* Holdings Table */}
      <CollapsibleSection title={t('status.positions')} defaultOpen>
        <HoldingsTable
          holdings={status.holdings}
          missingPrices={status.missing_prices}
          cash={status.cash}
          displayCurrency={currency}
          showEur={showEur}
          eurMetrics={eur}
          locale={locale}
        />
      </CollapsibleSection>

      {/* Realized Gains */}
      {status.realized_sales.length > 0 && (
        <CollapsibleSection
          title={t('status.realizedGains')}
          secondary={`(${t('status.realizedGainsMethod')})`}
        >
          <RealizedGainsTable realizedSales={status.realized_sales} locale={locale} />
        </CollapsibleSection>
      )}

      {/* Dividends Received */}
      {status.dividends_received.length > 0 && (
        <CollapsibleSection title={t('status.dividendsReceived')}>
          <DividendsReceivedTable
            dividendsReceived={status.dividends_received}
            displayCurrency={currency}
            locale={locale}
          />
        </CollapsibleSection>
      )}

      {/* Withdrawals & Taxes */}
      {status.realized_withdrawals.length > 0 && (
        <CollapsibleSection title={t('status.withdrawals')}>
          <WithdrawalsTable
            realizedWithdrawals={status.realized_withdrawals}
            locale={locale}
            principalEur={status.principal_eur}
            dividendsEur={status.dividends_eur}
            taxRate={status.capital_gains_tax_rate}
          />
        </CollapsibleSection>
      )}
    </>
  );
};

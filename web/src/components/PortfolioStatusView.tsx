import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { getErrorMessage } from '../api';
import type { TimePeriod } from './PerformanceChart';

const PerformanceChart = lazy(() =>
  import('./PerformanceChart').then((m) => ({ default: m.PerformanceChart }))
);
const HoldingsAllocationChart = lazy(() =>
  import('./HoldingsAllocationChart').then((m) => ({ default: m.HoldingsAllocationChart }))
);
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PortfolioStatusProps {
  portfolioId: number | null;
}

const formatSignedCurrency = (value: number | null | undefined, currency: string = 'USD', locale: string = 'en-US'): string => {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency, locale)}`;
};

const formatSignedPercent = (value: number | null | undefined): string => {
  if (value == null) return '';
  const sign = value >= 0 ? '\u25B2' : '\u25BC';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'text-green-600' : 'text-red-600';
};

const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): JSX.Element | string => {
  if (currencyValue == null) return '-';
  const formattedCurrency = formatSignedCurrency(currencyValue, currency, locale);
  const formattedPercent = percentValue != null ? formatSignedPercent(percentValue) : '';
  const percentClass = currencyValue >= 0 ? 'text-green-600' : 'text-red-600';
  return (
    <>
      <span>{formattedCurrency}</span>
      {formattedPercent && <span className={`${percentClass} font-bold ml-1.5`}>{formattedPercent}</span>}
    </>
  );
};

export const PortfolioStatusView = ({ portfolioId }: PortfolioStatusProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1month');
  const { data: status, isLoading, error } = usePortfolioStatus(portfolioId);

  const getPerformanceParams = () => {
    if (timePeriod === '1month') {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        numPoints: 30
      };
    }
    return {
      startDate: undefined,
      endDate: undefined,
      numPoints: 60
    };
  };

  const params = getPerformanceParams();
  const { data: performance, isLoading: performanceLoading } = usePortfolioPerformance(
    portfolioId,
    params.startDate,
    params.endDate,
    params.numPoints
  );

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
    return (
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

  return (
    <div className="mb-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{status.portfolio_name}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Portfolio Value */}
          <div className="mb-6">
            <p className="text-sm text-muted-foreground mb-1">{t('status.marketValue')}</p>
            <p className="text-3xl font-bold">
              {status.current_value_eur !== null ? formatCurrency(status.current_value_eur, 'EUR', locale) : '-'}
            </p>
            <p className={`text-sm mt-1 ${getValueClass(status.unrealized_gains_eur)}`}>
              {formatCurrencyWithPercent(
                status.unrealized_gains_eur,
                status.unrealized_gains_percent,
                'EUR',
                locale
              )}
              <span className="text-muted-foreground ml-2 font-normal">{t('status.unrealized')}</span>
            </p>
          </div>

          {/* Financial Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.netInvested')}</p>
              <p className="text-lg font-semibold">{formatCurrency(status.principal_eur, 'EUR', locale)}</p>
              {status.currency_gains_eur !== null && (
                <p className={`text-xs mt-0.5 ${getValueClass(status.currency_gains_eur)}`}>
                  {t('status.fx')}: {formatSignedCurrency(status.currency_gains_eur, 'EUR', locale)}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.dividends')}</p>
              <p className="text-lg font-semibold">
                {status.dividends_eur !== null ? formatCurrency(status.dividends_eur, 'EUR', locale) : '-'}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.estTax')}</p>
              <p className="text-lg font-semibold">
                {status.tax_eur !== null ? formatCurrency(status.tax_eur, 'EUR', locale) : '-'}
              </p>
              {status.capital_gains_eur !== null && (
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {t('status.on')} {formatCurrency(status.capital_gains_eur, 'EUR', locale)}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('status.afterTaxValue')}</p>
              <p className="text-lg font-semibold">
                {status.current_value_after_tax_eur !== null
                  ? formatCurrency(status.current_value_after_tax_eur, 'EUR', locale)
                  : '-'}
              </p>
              <p className={`text-xs mt-0.5 ${getValueClass(status.total_return_after_tax_eur)}`}>
                {formatSignedCurrency(status.total_return_after_tax_eur, 'EUR', locale)}
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
                selectedPeriod={timePeriod}
                onPeriodChange={setTimePeriod}
              />
              <HoldingsAllocationChart
                holdings={status.holdings}
                cash={status.cash}
                loading={isLoading}
              />
            </div>
          </Suspense>

          {/* Holdings Table */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('status.positions')}</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('status.columns.ticker')}</TableHead>
                    <TableHead>{t('status.columns.quantity')}</TableHead>
                    <TableHead>{t('status.columns.avgCost')}</TableHead>
                    <TableHead>{t('status.columns.totalCost')}</TableHead>
                    <TableHead>{t('status.columns.currentPrice')}</TableHead>
                    <TableHead>{t('status.columns.marketValue')}</TableHead>
                    <TableHead>{t('status.columns.unrealizedGL')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow key="CASH">
                    <TableCell className="font-semibold">CASH</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>{formatCurrency(status.cash, 'USD', locale)}</TableCell>
                    <TableCell>-</TableCell>
                  </TableRow>
                  {status.holdings.map((holding) => (
                    <TableRow key={holding.ticker}>
                      <TableCell className="font-semibold">{holding.ticker}</TableCell>
                      <TableCell>{formatNumber(holding.quantity, 8)}</TableCell>
                      <TableCell>{formatCurrency(holding.average_cost, 'USD', locale)}</TableCell>
                      <TableCell>{formatCurrency(holding.total_cost, 'USD', locale)}</TableCell>
                      <TableCell>
                        {holding.current_price != null ? formatCurrency(holding.current_price, 'USD', locale) : '-'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {holding.current_value != null ? formatCurrency(holding.current_value, 'USD', locale) : '-'}
                      </TableCell>
                      <TableCell>
                        {holding.unrealized_gain_loss != null && holding.unrealized_gain_loss_percent != null
                          ? (
                            <div className="flex flex-col">
                              <span className={`font-semibold ${getValueClass(holding.unrealized_gain_loss)}`}>
                                {formatSignedCurrency(holding.unrealized_gain_loss, 'USD', locale)}
                              </span>
                              <span className={`text-xs ${getValueClass(holding.unrealized_gain_loss)}`}>
                                {holding.unrealized_gain_loss_percent >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(holding.unrealized_gain_loss_percent).toFixed(2)}%
                              </span>
                            </div>
                          )
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { useAggregatedSales } from '../hooks/useAggregatedSales';
import { getErrorMessage } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLocale } from '../hooks/useLocale';
import { formatSignedCurrency } from '../utils/formatters';

export const AnalyticsPage = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const portfolioId = useActivePortfolioId();
  const [tickerFilter, setTickerFilter] = useState('');
  const debouncedTicker = tickerFilter.trim().toUpperCase() || undefined;
  const { data, isLoading, error } = useAggregatedSales(portfolioId, debouncedTicker);

  if (!portfolioId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">{t('status.noPortfolio')}</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-destructive">{t('analytics.error', { message: getErrorMessage(error) })}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const sales = data.sales;
  const avgWinRate = sales.length > 0
    ? sales.reduce((sum, s) => sum + s.win_rate, 0) / sales.length
    : null;
  const salesWithFactor = sales.filter((s) => s.profit_factor !== null);
  const avgProfitFactor = salesWithFactor.length > 0
    ? salesWithFactor.reduce((sum, s) => sum + s.profit_factor!, 0) / salesWithFactor.length
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics.realizedGains')}</CardTitle>
        <CardDescription className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            {t('analytics.totalGainLoss')}:{' '}
            <span className={`font-medium ${data.total_realized_gain_loss >= 0 ? 'text-positive' : 'text-negative'}`}>
              {formatSignedCurrency(data.total_realized_gain_loss, 'USD', locale)}
            </span>
          </span>
          {avgWinRate !== null && (
            <span>
              {t('analytics.avgWinRate')}:{' '}
              <span className="font-medium text-foreground">{avgWinRate.toFixed(1)}%</span>
            </span>
          )}
          {avgProfitFactor !== null && (
            <span>
              {t('analytics.avgProfitFactor')}:{' '}
              <span className="font-medium text-foreground">{avgProfitFactor.toFixed(2)}</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 max-w-xs">
          <Input
            id="ticker-filter"
            placeholder={t('analytics.filterByTicker')}
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
          />
        </div>
        {data.sales.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{t('analytics.noSells')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('analytics.columns.ticker')}</TableHead>
                  <TableHead className="text-right">{t('analytics.columns.gainLoss')}</TableHead>
                  <TableHead className="text-right">{t('analytics.columns.winRate')}</TableHead>
                  <TableHead className="text-right">{t('analytics.columns.profitFactor')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((row) => {
                  const colorClass = row.total_gain_loss >= 0 ? 'text-positive' : 'text-negative';
                  return (
                    <TableRow key={row.ticker}>
                      <TableCell className="font-medium">{row.ticker}</TableCell>
                      <TableCell className={`text-right font-semibold ${colorClass}`}>
                        {formatSignedCurrency(row.total_gain_loss, 'USD', locale)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {row.win_rate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {row.profit_factor !== null ? row.profit_factor.toFixed(2) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

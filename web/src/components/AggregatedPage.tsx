import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { usePortfolios, useUpdatePortfolioInclusion } from '../hooks/usePortfolios';
import { useAggregatedStatus } from '../hooks/useAggregatedStatus';
import { useAggregatedPerformance } from '../hooks/useAggregatedPerformance';
import { PortfolioStatusContent, PortfolioStatusSkeleton } from './PortfolioStatusView';
import { getErrorMessage } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCwIcon } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';

export const AggregatedPage = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const inclusionMutation = useUpdatePortfolioInclusion();

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const includedCount = portfolios?.filter((p) => p.include_in_aggregation).length ?? 0;
  const hasIncluded = includedCount > 0;

  const { data: status, isLoading: statusLoading, error, dataUpdatedAt } = useAggregatedStatus(hasIncluded);
  const { data: performance, isLoading: performanceLoading } = useAggregatedPerformance(
    undefined,
    undefined,
    365,
    hasIncluded
  );

  const togglePortfolio = async (id: number, currentValue: boolean) => {
    await inclusionMutation.mutateAsync({ portfolioId: id, include: !currentValue });
    inclusionMutation.invalidateInclusion();
  };

  const selectAll = async () => {
    if (!portfolios) return;
    const toInclude = portfolios.filter((p) => !p.include_in_aggregation);
    await Promise.all(
      toInclude.map((p) => inclusionMutation.mutateAsync({ portfolioId: p.id, include: true }))
    );
    inclusionMutation.invalidateInclusion();
  };

  const deselectAll = async () => {
    if (!portfolios) return;
    const toExclude = portfolios.filter((p) => p.include_in_aggregation);
    await Promise.all(
      toExclude.map((p) => inclusionMutation.mutateAsync({ portfolioId: p.id, include: false }))
    );
    inclusionMutation.invalidateInclusion();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['aggregatedStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['aggregatedPerformance'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Selector */}
      <Card>
        <CardHeader>
          <CardTitle>{t('aggregate.title')}</CardTitle>
          <CardDescription>{t('aggregate.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {portfoliosLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-48" />
              ))}
            </div>
          ) : portfolios && portfolios.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {t('aggregate.selectAll')}
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  {t('aggregate.deselectAll')}
                </Button>
                <span className="text-sm text-muted-foreground ml-auto">
                  {t('aggregate.selectedCount', { selected: includedCount, total: portfolios.length })}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {portfolios.map((portfolio) => (
                  <label
                    key={portfolio.id}
                    className="flex items-center gap-2 cursor-pointer rounded-md border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={portfolio.include_in_aggregation}
                      onCheckedChange={() => togglePortfolio(portfolio.id, portfolio.include_in_aggregation)}
                    />
                    <span className="text-sm font-medium">{portfolio.name}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('status.noPortfolio')}</p>
          )}
        </CardContent>
      </Card>

      {/* Aggregated Status */}
      {!hasIncluded ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">{t('aggregate.noSelection')}</p>
          </CardContent>
        </Card>
      ) : statusLoading ? (
        <PortfolioStatusSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">{t('status.error', { message: getErrorMessage(error) })}</p>
          </CardContent>
        </Card>
      ) : status ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('aggregate.summary')}</CardTitle>
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
          </CardHeader>
          <PortfolioStatusContent
            status={status}
            performance={performance}
            performanceLoading={performanceLoading}
          />
        </Card>
      ) : null}
    </div>
  );
};

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolios } from '../hooks/usePortfolios';
import { useAggregatedStatus } from '../hooks/useAggregatedStatus';
import { useAggregatedPerformance } from '../hooks/useAggregatedPerformance';
import { PortfolioStatusContent, PortfolioStatusSkeleton } from './PortfolioStatusView';
import { getErrorMessage } from '../api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '../hooks/useLocale';

export const AggregatedPage = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Default: select all portfolios once loaded
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && selectedIds.length === 0) {
      setSelectedIds(portfolios.map((p) => p.id));
    }
  }, [portfolios]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: status, isLoading: statusLoading, error, dataUpdatedAt } = useAggregatedStatus(selectedIds);
  const { data: performance, isLoading: performanceLoading } = useAggregatedPerformance(
    selectedIds,
    undefined,
    undefined,
    365
  );

  const togglePortfolio = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (portfolios) setSelectedIds(portfolios.map((p) => p.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
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
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {t('aggregate.selectAll')}
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  {t('aggregate.deselectAll')}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {portfolios.map((portfolio) => (
                  <label
                    key={portfolio.id}
                    className="flex items-center gap-2 cursor-pointer rounded-md border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.includes(portfolio.id)}
                      onCheckedChange={() => togglePortfolio(portfolio.id)}
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
      {selectedIds.length === 0 ? (
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
              <CardDescription>
                {t('status.fetchedAt', {
                  time: new Date(dataUpdatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                })}
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

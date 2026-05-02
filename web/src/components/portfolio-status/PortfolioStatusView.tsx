import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { AlertTriangleIcon, BriefcaseIcon, InboxIcon } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { getErrorMessage } from '../../api';
import { useLocale } from '../../hooks/useLocale';
import { usePortfolioStatusView } from '../../hooks/usePortfolioStatusView';
import { parsePortfolioId } from '../../utils/parsePortfolioId';

import { PortfolioStatusContent } from './PortfolioStatusContent';
import { PortfolioStatusSkeleton } from './PortfolioStatusSkeleton';
import { StatusToolbar } from './StatusToolbar';

export const PortfolioStatusView = () => {
  const { id } = useParams<{ id: string }>();
  const portfolioId = parsePortfolioId(id);
  const { t } = useTranslation();
  const locale = useLocale();

  const {
    effectiveStatus,
    performance,
    isLoading,
    isPerformanceLoading,
    isLivePricesFetching,
    livePrices,
    livePricesError,
    performanceError,
    error,
    latestUpdateAt,
    isEmptyPortfolio,
    isRefreshing,
    handleRefresh,
  } = usePortfolioStatusView(portfolioId);

  if (portfolioId == null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <BriefcaseIcon />
          </EmptyMedia>
          <EmptyTitle>{t('status.noPortfolio')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return <PortfolioStatusSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangleIcon className="h-4 w-4" />
        <AlertDescription>{t('status.error', { message: getErrorMessage(error) })}</AlertDescription>
      </Alert>
    );
  }

  if (effectiveStatus == null) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{t('status.noData')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <PortfolioStatusContent
        status={effectiveStatus}
        performance={performance}
        performanceError={performanceError}
        isPerformanceLoading={isPerformanceLoading}
        isAllocationLoading={isLivePricesFetching && !livePrices}
        isEmptyPortfolio={isEmptyPortfolio}
        providerUnavailable={livePrices?.provider_unavailable === true}
        toolbar={
          <StatusToolbar
            isEmptyPortfolio={isEmptyPortfolio}
            livePricesError={Boolean(livePricesError)}
            latestUpdateAt={latestUpdateAt}
            locale={locale}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        }
      />
    </div>
  );
};

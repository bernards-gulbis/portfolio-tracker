import { useTranslation } from 'react-i18next';
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StatusToolbarProps {
  isEmptyPortfolio: boolean;
  livePricesError: boolean;
  latestUpdateAt: number;
  locale: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const StatusToolbar = ({
  isEmptyPortfolio,
  livePricesError,
  latestUpdateAt,
  locale,
  isRefreshing,
  onRefresh,
}: StatusToolbarProps) => {
  const { t } = useTranslation();
  const hasPortfolio = !isEmptyPortfolio;
  return (
    <div className="flex items-center gap-2">
      {hasPortfolio && livePricesError && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          {t('status.livePriceError')}
        </span>
      )}
      {hasPortfolio && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {latestUpdateAt > 0 &&
            t('status.fetchedAt', {
              time: new Date(latestUpdateAt).toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            })}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t('status.refreshPortfolio')}
          >
            <RefreshCwIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </span>
      )}
    </div>
  );
};

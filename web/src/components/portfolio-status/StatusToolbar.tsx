import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '../../utils/formatters';

const TICK_MS = 30_000;
const STALE_THRESHOLD_MS = 60_000;

interface StatusToolbarProps {
  isEmptyPortfolio: boolean;
  livePricesError: boolean;
  latestUpdateAt: number;
  locale: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

type Freshness = 'live' | 'stale' | 'error';

export const StatusToolbar = ({
  isEmptyPortfolio,
  livePricesError,
  latestUpdateAt,
  locale,
  isRefreshing,
  onRefresh,
}: StatusToolbarProps) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (isEmptyPortfolio) {
    return <div />;
  }

  const ageMs = latestUpdateAt > 0 ? now - latestUpdateAt : null;
  const freshness: Freshness = livePricesError
    ? 'error'
    : ageMs != null && ageMs <= STALE_THRESHOLD_MS
      ? 'live'
      : 'stale';

  const dotClass =
    freshness === 'live'
      ? 'bg-[var(--positive)]'
      : freshness === 'stale'
        ? 'bg-amber-500'
        : 'bg-[var(--negative)]';

  const freshnessLabel = t(`status.freshness.${freshness}`);

  const relativeText = latestUpdateAt > 0
    ? formatRelativeTime(
        latestUpdateAt,
        now,
        {
          justNow: t('status.justNow'),
          minutes: (count: number) => t('status.minutesAgo', { count }),
          hours: (count: number) => t('status.hoursAgo', { count }),
          days: (count: number) => t('status.daysAgo', { count }),
        },
        locale,
      )
    : null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${dotClass} ${freshness === 'live' ? 'animate-pulse' : ''}`}
        />
        <span className="text-muted-foreground">{freshnessLabel}</span>
      </span>
      {relativeText && (
        <span className="text-muted-foreground tabular-nums">
          {t('status.updatedRelative', { relative: relativeText })}
        </span>
      )}
      {livePricesError && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          {t('status.livePriceError')}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label={t('status.refreshPortfolio')}
      >
        <RefreshCwIcon className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        <span className="text-xs">{t('status.refresh')}</span>
      </Button>
    </div>
  );
};

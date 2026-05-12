import { useTranslation } from 'react-i18next';
import { CardTitle } from '@/components/ui/card';
import { type TimePeriod } from '../../utils/chartHelpers';
import type { HeaderInfo, ViewMode } from './types';

interface Props {
  viewMode: ViewMode;
  headerInfo: (HeaderInfo & { date: string; isHovering: boolean }) | null;
  timePeriod: TimePeriod;
}

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  '1month': '1M',
  '3month': '3M',
  '6month': '6M',
  'ytd': 'YTD',
  '1year': '1Y',
  'all': 'All',
};

export const PerformanceChartHeader = ({ viewMode, headerInfo, timePeriod }: Props) => {
  const { t } = useTranslation();
  const titleText = viewMode === 'value'
    ? t('chart.performance.titleValue')
    : t('chart.performance.title');
  const periodLabel = TIME_PERIOD_LABELS[timePeriod];

  if (headerInfo == null) {
    return (
      <div className="flex items-center gap-2">
        <CardTitle className="text-sm font-semibold">{titleText}</CardTitle>
      </div>
    );
  }

  const colorClass = headerInfo.isPositive ? 'text-positive' : 'text-negative';
  const showInlineValue = headerInfo.isHovering;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CardTitle className="text-sm font-semibold">{titleText}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {headerInfo.isHovering ? headerInfo.date : periodLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {showInlineValue && (
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {headerInfo.displayValue}
          </span>
        )}
        {headerInfo.mode === 'value' && headerInfo.changeDisplay != null && (
          <span className={`text-sm tabular-nums ${colorClass}`}>
            {headerInfo.changeDisplay}
            {headerInfo.pctDisplay && (
              <span className="font-bold ml-1">{headerInfo.pctDisplay}</span>
            )}
          </span>
        )}
        {headerInfo.mode === 'pct' && (
          <span className={`text-2xl font-bold tracking-tight tabular-nums ${colorClass}`}>
            {headerInfo.displayValue}
          </span>
        )}
        {headerInfo.spreadDisplay != null && (
          <span className="text-xs text-muted-foreground">
            · {t('status.vsSp500')}: <span className="tabular-nums">{headerInfo.spreadDisplay}</span>
          </span>
        )}
      </div>
    </div>
  );
};

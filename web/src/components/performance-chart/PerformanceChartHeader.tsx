import { useTranslation } from 'react-i18next';
import { CardTitle } from '@/components/ui/card';
import type { HeaderInfo, ViewMode } from './types';

interface Props {
  viewMode: ViewMode;
  headerInfo: (HeaderInfo & { date: string; isHovering: boolean }) | null;
}

export const PerformanceChartHeader = ({ viewMode, headerInfo }: Props) => {
  const { t } = useTranslation();
  const titleText = viewMode === 'value'
    ? t('chart.performance.titleValue')
    : t('chart.performance.title');

  if (headerInfo == null) {
    return (
      <div className="flex items-center gap-2">
        <CardTitle className="text-sm font-semibold">{titleText}</CardTitle>
      </div>
    );
  }

  const colorClass = headerInfo.isPositive ? 'text-positive' : 'text-negative';

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CardTitle className="text-sm font-semibold">{titleText}</CardTitle>
        {headerInfo.isHovering && (
          <span className="text-xs text-muted-foreground">{headerInfo.date}</span>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {headerInfo.isHovering && (
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {headerInfo.displayValue}
          </span>
        )}
        {headerInfo.mode === 'value' && headerInfo.changeDisplay != null && (
          <span className={`inline-flex items-baseline gap-1.5 text-sm tabular-nums ${colorClass}`}>
            <span aria-hidden>{headerInfo.isPositive ? '▲' : '▼'}</span>
            <span>{headerInfo.changeDisplay}</span>
            {headerInfo.pctDisplay && (
              <span className="font-bold">{headerInfo.pctDisplay}</span>
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

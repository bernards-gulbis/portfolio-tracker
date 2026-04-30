import { useTranslation } from 'react-i18next';
import { CardTitle } from '@/components/ui/card';
import type { HeaderInfo, ViewMode } from './types';

interface Props {
  viewMode: ViewMode;
  headerInfo: (HeaderInfo & { date: string; isHovering: boolean }) | null;
}

/** Renders the title + the headline value/change/principal/sp500 mini-rows. */
export const PerformanceChartHeader = ({ viewMode, headerInfo }: Props) => {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CardTitle className="text-sm font-semibold">
          {viewMode === 'value' ? t('chart.performance.titleValue') : t('chart.performance.title')}
        </CardTitle>
        {headerInfo?.isHovering && (
          <span className="text-xs text-muted-foreground">{headerInfo.date}</span>
        )}
      </div>
      {headerInfo && (
        <div>
          <span className="text-2xl font-bold tracking-tight tabular-nums">
            {headerInfo.displayValue}
          </span>
          {headerInfo.mode === 'value' && headerInfo.changeDisplay != null && (
            <span
              className={`text-sm ml-2 ${headerInfo.isPositive ? 'text-positive' : 'text-negative'}`}
            >
              {headerInfo.changeDisplay}
              {headerInfo.pctDisplay && (
                <span className="font-bold ml-1.5">{headerInfo.pctDisplay}</span>
              )}
            </span>
          )}
          {headerInfo.mode === 'value' && headerInfo.principalDisplay != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <span
                className="inline-block h-2 w-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: 'var(--chart-2)' }}
              />
              {t('chart.performance.principal')}: {headerInfo.principalDisplay}
            </div>
          )}
          {headerInfo.mode === 'pct' && headerInfo.sp500Display != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <span
                className="inline-block h-2 w-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: 'var(--chart-4)' }}
              />
              {t('chart.performance.sp500')}: {headerInfo.sp500Display}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

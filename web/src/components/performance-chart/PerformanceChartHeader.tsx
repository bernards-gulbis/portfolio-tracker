import { useTranslation } from 'react-i18next';
import { InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { HeaderInfo, ViewMode } from './types';

interface Props {
  viewMode: ViewMode;
  headerInfo: (HeaderInfo & { date: string; isHovering: boolean }) | null;
  warnings?: string[];
}

export const PerformanceChartHeader = ({ viewMode, headerInfo, warnings }: Props) => {
  const { t } = useTranslation();
  const titleText = viewMode === 'value'
    ? t('chart.performance.titleValue')
    : t('chart.performance.title');
  const hasWarnings = warnings != null && warnings.length > 0;
  const titleRowClass = headerInfo == null
    ? 'flex items-center gap-2'
    : 'flex items-center gap-2 mb-1';
  const colorClass = headerInfo?.isPositive ? 'text-positive' : 'text-negative';

  return (
    <div>
      <div className={titleRowClass}>
        <CardTitle className="text-sm font-semibold">{titleText}</CardTitle>
        {headerInfo?.isHovering && (
          <span className="text-xs text-muted-foreground">{headerInfo.date}</span>
        )}
        {hasWarnings && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                aria-label={t('status.chartWarningsButton')}
              >
                <InfoIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="text-sm space-y-2">
              {warnings.map((w, i) => (
                <p key={`${i}-${w}`} className="leading-relaxed">{w}</p>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
      {headerInfo != null && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {headerInfo.mode === 'value' && (
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
      )}
    </div>
  );
};

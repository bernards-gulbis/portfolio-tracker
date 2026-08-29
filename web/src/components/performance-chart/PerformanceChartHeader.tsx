import { useTranslation } from 'react-i18next';
import { InfoIcon } from 'lucide-react';
import { CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon
                  aria-label={t('common.moreInfo')}
                  className="h-3 w-3 text-muted-foreground cursor-help"
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-72 space-y-2">
                {warnings.map((w, i) => (
                  <p key={`${i}-${w}`} className="leading-relaxed">{w}</p>
                ))}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

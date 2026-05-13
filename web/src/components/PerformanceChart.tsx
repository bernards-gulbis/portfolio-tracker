import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ChartConfig } from '@/components/ui/chart';
import { useLocale } from '../hooks/useLocale';
import { type TimePeriod } from '../utils/chartHelpers';
import { useChartData } from './performance-chart/useChartData';
import { getHeaderValues, parseYMD } from './performance-chart/headerInfo';
import { PerformanceChartHeader } from './performance-chart/PerformanceChartHeader';
import { PerformanceChartCanvas } from './performance-chart/PerformanceChartCanvas';
import type { PerformanceChartProps, ViewMode } from './performance-chart/types';

export type {
  LiveLastPoint,
  PerformanceChartProps,
} from './performance-chart/types';

export const PerformanceChart = ({
  data,
  isLoading,
  currency = 'EUR',
  liveLastPoint,
  warnings,
}: PerformanceChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<ViewMode>('value');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1month');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartConfig = useMemo(
    () =>
      ({
        principal: {
          label: t('chart.performance.principal'),
          color: 'var(--chart-2)',
        },
        currentValue: {
          label: t('chart.performance.currentValue'),
          color: 'var(--chart-1)',
        },
        returnPct: {
          label: t('chart.performance.returnPct'),
          color: 'var(--chart-1)',
        },
        sp500ReturnPct: {
          label: t('chart.performance.sp500'),
          color: 'var(--chart-4)',
        },
      }) satisfies ChartConfig,
    [t],
  );

  const chartData = useChartData(data, timePeriod, currency, liveLastPoint);

  const ppLabel = t('status.points');

  const headerInfo = useMemo(() => {
    if (chartData.length === 0) return null;
    const first = chartData[0];
    const displayPoint =
      activeIndex == null ? chartData.at(-1) : chartData[activeIndex];
    if (!displayPoint) return null;

    const values = getHeaderValues(
      displayPoint,
      first,
      viewMode,
      currency,
      locale,
      timePeriod === 'all',
      ppLabel,
    );
    const dateStr = parseYMD(displayPoint.date).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return { ...values, date: dateStr, isHovering: activeIndex != null };
  }, [chartData, activeIndex, viewMode, currency, locale, timePeriod, ppLabel]);

  const handleMouseMove = useCallback(
    (state: { activeTooltipIndex?: number | string | null }) => {
      const idx = state.activeTooltipIndex;
      if (idx != null) {
        const num = typeof idx === 'number' ? idx : Number(idx);
        if (!Number.isNaN(num)) setActiveIndex(num);
      }
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (isLoading) {
    return (
      <Card role="status">
        <CardHeader>
          <div>
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-8 w-40" />
          </div>
          <CardAction>
            <Skeleton className="h-8 w-48" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (data == null || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('chart.performance.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('chart.performance.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('chart.performance.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('chart.performance.insufficientData')}</p>
        </CardContent>
      </Card>
    );
  }

  const timePeriodSelector = (
    <Tabs value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
      <TabsList>
        <TabsTrigger value="1month">1M</TabsTrigger>
        <TabsTrigger value="3month">3M</TabsTrigger>
        <TabsTrigger value="6month">6M</TabsTrigger>
        <TabsTrigger value="ytd">YTD</TabsTrigger>
        <TabsTrigger value="1year">1Y</TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('chart.performance.title')}</CardTitle>
          <CardAction>{timePeriodSelector}</CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('chart.performance.insufficientDataForPeriod')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <PerformanceChartHeader viewMode={viewMode} headerInfo={headerInfo} warnings={warnings} />
        <CardAction>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="value">{currency}</TabsTrigger>
                <TabsTrigger value="pct">%</TabsTrigger>
              </TabsList>
            </Tabs>
            {timePeriodSelector}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PerformanceChartCanvas
          chartConfig={chartConfig}
          chartData={chartData}
          viewMode={viewMode}
          currency={currency}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </CardContent>
    </Card>
  );
};

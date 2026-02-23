import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

interface PerformanceDataPoint {
  date: string;
  principal_eur: number;
  current_value_eur: number | null;
  return_pct: number | null;
}

export type TimePeriod = '1month' | '3month' | '6month' | 'ytd' | '1year' | 'all';

type ViewMode = 'eur' | 'pct';

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  loading?: boolean;
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC shift in negative-offset timezones). */
const parseYMD = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Compact currency label for YAxis (e.g. €1.5M, €10k, €500). */
const formatCompactEur = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return `€${value.toFixed(0)}`;
};

/** Get the cutoff date string (YYYY-MM-DD) for a given period. */
const getCutoffDate = (period: TimePeriod): string | null => {
  if (period === 'all') return null;
  const now = new Date();
  let cutoff: Date;
  switch (period) {
    case '1month':
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case '3month':
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case '6month':
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case 'ytd':
      cutoff = new Date(now.getFullYear(), 0, 1);
      break;
    case '1year':
      cutoff = new Date(now);
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
  }
  return cutoff.toISOString().split('T')[0];
};

export const PerformanceChart = ({
  data,
  loading,
}: PerformanceChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<ViewMode>('eur');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1month');

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
      }) satisfies ChartConfig,
    [t],
  );

  // Client-side period filtering — no refetch needed
  const chartData = useMemo(() => {
    const cutoff = getCutoffDate(timePeriod);
    const filtered = cutoff ? data.filter((p) => p.date >= cutoff) : data;
    return filtered.map((point) => ({
      date: point.date,
      principal: point.principal_eur,
      currentValue: point.current_value_eur,
      returnPct: point.return_pct,
    }));
  }, [data, timePeriod]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <CardAction>
            <Skeleton className="h-8 w-20 rounded-md" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chart.performance.title')}</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="eur">EUR</TabsTrigger>
                <TabsTrigger value="pct">%</TabsTrigger>
              </TabsList>
            </Tabs>
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
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ComposedChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12 }}
          >
            <defs>
              <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-currentValue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-currentValue)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value: string) =>
                parseYMD(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
              }
              minTickGap={50}
            />
            {viewMode === 'eur' ? (
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={60}
                tickFormatter={formatCompactEur}
              />
            ) : (
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={50}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              />
            )}
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) =>
                    parseYMD(value as string).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                  formatter={(value, name) => {
                    if (value == null) return t('common.notAvailable');
                    if (name === 'returnPct') return `${(value as number).toFixed(2)}%`;
                    return formatCurrency(value as number, 'EUR', locale);
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {viewMode === 'eur' ? (
              <>
                <Area
                  type="monotone"
                  dataKey="currentValue"
                  fill="url(#fillValue)"
                  stroke="var(--color-currentValue)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="principal"
                  stroke="var(--color-principal)"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              </>
            ) : (
              <>
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="returnPct"
                  stroke="var(--color-returnPct)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </>
            )}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

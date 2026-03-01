import { memo, type ComponentProps, useMemo, useState } from 'react';
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
import type { PerformanceDataPoint } from '../api';

type TimePeriod = '1month' | '3month' | '6month' | 'ytd' | '1year' | 'all';

type ViewMode = 'value' | 'pct';

interface LiveLastPoint {
  currentValue: number;
  /** Live USD→EUR rate (from status response). Used to compute EUR current value. */
  fxRate: number | null;
  /** Raw (non-rebased) return % for live last point. */
  returnPct: number | null;
}

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  loading?: boolean;
  currency?: 'EUR' | 'USD';
  liveLastPoint?: LiveLastPoint;
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC shift in negative-offset timezones). */
const parseYMD = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Compact currency label for YAxis (e.g. €1.5M, €10k or $1.5M, $10k). */
const formatCompactValue = (value: number, currency: 'EUR' | 'USD'): string => {
  const symbol = currency === 'EUR' ? '€' : '$';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
  return `${symbol}${value.toFixed(0)}`;
};

/** Subtract months from a date, clamping to the last day of the target month
 *  (e.g. March 31 minus 1 month → Feb 28, not March 3). */
const subtractMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  // If the day overflowed (e.g. 31 → 3), clamp to last day of target month
  if (result.getDate() !== date.getDate()) {
    result.setDate(0);
  }
  return result;
};

/** Get the cutoff date string (YYYY-MM-DD) for a given period. */
const getCutoffDate = (period: TimePeriod): string | null => {
  if (period === 'all') return null;
  const now = new Date();
  let cutoff: Date;
  switch (period) {
    case '1month':
      cutoff = subtractMonths(now, 1);
      break;
    case '3month':
      cutoff = subtractMonths(now, 3);
      break;
    case '6month':
      cutoff = subtractMonths(now, 6);
      break;
    case 'ytd':
      cutoff = new Date(now.getFullYear(), 0, 1);
      break;
    case '1year':
      cutoff = subtractMonths(now, 12);
      break;
  }
  return cutoff.toISOString().split('T')[0];
};

const PerformanceTooltipItem = memo(({
  value,
  name,
  color,
  chartConfig,
  locale,
  currency,
  notAvailableLabel,
}: {
  value: number | string;
  name: string;
  color: string;
  chartConfig: ChartConfig;
  locale: string;
  currency: 'EUR' | 'USD';
  notAvailableLabel: string;
}) => {
  let formatted: string;
  if (value == null) {
    formatted = notAvailableLabel;
  } else if (name === 'returnPct' || name === 'sp500ReturnPct') {
    formatted = `${(value as number).toFixed(2)}%`;
  } else {
    formatted = formatCurrency(value as number, currency, locale);
  }
  return (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      <div className="flex flex-1 justify-between items-center leading-none">
        <span className="text-muted-foreground">
          {chartConfig[name as keyof typeof chartConfig]?.label || name}
        </span>
        <span className="font-mono font-medium tabular-nums ml-2">
          {formatted}
        </span>
      </div>
    </>
  );
});

const PerformanceTooltipContent = memo(({
  chartConfig,
  locale,
  currency,
  notAvailableLabel,
  ...rest
}: ComponentProps<typeof ChartTooltipContent> & {
  chartConfig: ChartConfig;
  locale: string;
  currency: 'EUR' | 'USD';
  notAvailableLabel: string;
}) => (
  <ChartTooltipContent
    {...rest}
    labelFormatter={(value) =>
      parseYMD(value as string).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    formatter={(value, name, item) => (
      <PerformanceTooltipItem
        value={value as number | string}
        name={name as string}
        color={item.color ?? ''}
        chartConfig={chartConfig}
        locale={locale}
        currency={currency}
        notAvailableLabel={notAvailableLabel}
      />
    )}
  />
));

export const PerformanceChart = ({
  data,
  loading,
  currency = 'EUR',
  liveLastPoint,
}: PerformanceChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<ViewMode>('value');
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
        sp500ReturnPct: {
          label: t('chart.performance.sp500'),
          color: 'var(--chart-4)',
        },
      }) satisfies ChartConfig,
    [t],
  );

  // Client-side period filtering — no refetch needed
  const chartData = useMemo(() => {
    const cutoff = getCutoffDate(timePeriod);
    const filtered = cutoff ? data.filter((p) => p.date >= cutoff) : data;

    const useEurMode = currency === 'EUR';

    // Rebase return % so both portfolio and S&P 500 start at 0% at the first
    // visible point. Both series use the same FX-adjustment pattern:
    //   factor_D = (1 + return_D/100) × fx_D
    //   rebased  = factor_D / factor_0 − 1
    // fx_inception cancels, so only per-point fx_rate values are needed.
    const firstReturnPoint = filtered.find((p) =>
      p.return_pct != null && (!useEurMode || p.fx_rate != null)
    );
    const firstReturnPct = firstReturnPoint?.return_pct ?? null;
    const firstReturnFx = firstReturnPoint?.fx_rate ?? null;
    const baseReturnFactor = firstReturnPct == null ? null
      : useEurMode && firstReturnFx != null
        ? (1 + firstReturnPct / 100) * firstReturnFx
        : 1 + firstReturnPct / 100;
    // S&P 500 rebasing base: in EUR mode include the FX rate at the first visible sp500 point
    // so the benchmark also reflects EUR/USD movements. Formula derivation:
    //   sp500_eur_D = sp500_usd_factor_D × (fx_D / fx_inception)
    //   sp500_eur_rebased = sp500_eur_D / sp500_eur_firstVisible − 1
    // fx_inception cancels, leaving: (sp500_usd_factor_D × fx_D) / (sp500_usd_factor_0 × fx_0) − 1
    const firstSp500Point = filtered.find((p) =>
      p.sp500_return_pct != null && (!useEurMode || p.fx_rate != null)
    );
    const firstSp500Pct = firstSp500Point?.sp500_return_pct ?? null;
    const firstSp500Fx = firstSp500Point?.fx_rate ?? null;
    const baseSp500Factor = firstSp500Pct == null ? null
      : useEurMode && firstSp500Fx != null
        ? (1 + firstSp500Pct / 100) * firstSp500Fx
        : 1 + firstSp500Pct / 100;

    return filtered.map((point, index) => {
      const isLast = index === filtered.length - 1;
      const liveOverride = isLast ? liveLastPoint : undefined;

      // Resolve the FX rate for this point: live rate for last point, historical otherwise
      const effectiveFxRate = isLast && liveOverride?.fxRate != null
        ? liveOverride.fxRate
        : point.fx_rate;

      const rawReturnPct = liveOverride ? liveOverride.returnPct : point.return_pct;

      let returnRebased: number | null = null;
      if (rawReturnPct != null && baseReturnFactor != null && baseReturnFactor !== 0) {
        const returnFactor = useEurMode && effectiveFxRate != null
          ? (1 + rawReturnPct / 100) * effectiveFxRate
          : (1 + rawReturnPct / 100);
        returnRebased = (returnFactor / baseReturnFactor - 1) * 100;
      }
      let sp500Rebased: number | null = null;
      if (point.sp500_return_pct != null && baseSp500Factor != null && baseSp500Factor !== 0) {
        // In EUR mode multiply by fx_rate so the benchmark includes currency effects
        const sp500Factor = useEurMode && effectiveFxRate != null
          ? (1 + point.sp500_return_pct / 100) * effectiveFxRate
          : (1 + point.sp500_return_pct / 100);
        sp500Rebased = (sp500Factor / baseSp500Factor - 1) * 100;
      }

      // Current value: use live override for last point, otherwise historical
      const rawCurrentValue = isLast && liveOverride
        ? liveOverride.currentValue
        : point.current_value;
      // Convert to EUR using the effective FX rate when currency is EUR
      const currentValue = useEurMode && effectiveFxRate != null
        ? (rawCurrentValue != null ? rawCurrentValue * effectiveFxRate : null)
        : rawCurrentValue;

      // Principal in selected currency — EUR uses historical-rate value from backend
      const principal = useEurMode
        ? (point.principal_eur ?? null)
        : point.principal;

      return {
        date: point.date,
        principal,
        currentValue,
        returnPct: returnRebased,
        sp500ReturnPct: sp500Rebased,
      };
    });
  }, [data, timePeriod, currency, liveLastPoint]);

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
          <p className="text-sm text-muted-foreground">{t('chart.performance.insufficientDataForPeriod')}</p>
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
                <TabsTrigger value="value">{currency}</TabsTrigger>
                <TabsTrigger value="pct">%</TabsTrigger>
              </TabsList>
            </Tabs>
            {timePeriodSelector}
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
              <linearGradient id="fillPerformanceValue" x1="0" y1="0" x2="0" y2="1">
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
            {viewMode === 'value' ? (
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={60}
                tickFormatter={(v: number) => formatCompactValue(v, currency)}
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
                <PerformanceTooltipContent
                  chartConfig={chartConfig}
                  locale={locale}
                  currency={currency}
                  notAvailableLabel={t('common.notAvailable')}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent className="text-[10px] sm:text-xs" />} />
            {viewMode === 'value' ? (
              <>
                <Area
                  type="monotone"
                  dataKey="currentValue"
                  fill="url(#fillPerformanceValue)"
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
                <Line
                  type="monotone"
                  dataKey="sp500ReturnPct"
                  stroke="var(--color-sp500ReturnPct)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
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

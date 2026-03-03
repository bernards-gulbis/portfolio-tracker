import { useCallback, useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';
import type { PerformanceDataPoint } from '../api';
import type { Currency } from '../hooks/useCurrencyPreference';

type TimePeriod = '1month' | '3month' | '6month' | 'ytd' | '1year' | 'all';

type ViewMode = 'value' | 'pct';

interface LiveLastPoint {
  currentValue: number;
  /** Live USD→EUR rate (from status response). Used to compute EUR current value. */
  fxRate: number | null;
}

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  isLoading?: boolean;
  currency?: Currency;
  liveLastPoint?: LiveLastPoint;
}

interface ChartDataPoint {
  date: string;
  principal: number | null;
  currentValue: number | null;
  returnPct: number | null;
  sp500ReturnPct: number | null;
}

/** Parse a YYYY-MM-DD string as a local date (avoids UTC shift in negative-offset timezones). */
const parseYMD = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Compact currency label for YAxis (e.g. €1.5M, €10k or $1.5M, $10k). */
const formatCompactValue = (value: number, currency: Currency): string => {
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

/** Compute the header display values.
 *  Uses the TWR return_pct (rebased) for the percentage — avoids division by near-zero principal.
 *  Absolute change: "all" period uses value − principal; shorter periods use value − first value. */
const getHeaderValues = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  viewMode: ViewMode,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
) => {
  if (viewMode === 'value') {
    const value = point.currentValue;
    const principal = point.principal;
    if (value == null) return { displayValue: '-', principalDisplay: null, change: null, changePct: null, isPositive: true };
    const formatted = formatCurrency(value, currency, locale);
    const principalDisplay = principal != null ? formatCurrency(principal, currency, locale) : null;
    // Absolute change: vs principal for "all", vs period start for shorter periods
    const base = isAllTime ? principal : first.currentValue;
    if (base == null) return { displayValue: formatted, principalDisplay, change: null, changePct: null, isPositive: true };
    const diff = value - base;
    // Use TWR return % for the percentage (already rebased on the frontend)
    const twrPct = point.returnPct;
    return {
      displayValue: formatted,
      principalDisplay,
      change: formatCurrency(Math.abs(diff), currency, locale),
      changePct: twrPct != null ? Math.abs(twrPct).toFixed(2) : null,
      isPositive: diff >= 0,
    };
  } else {
    const pct = point.returnPct;
    const sp500Pct = point.sp500ReturnPct;
    if (pct == null) return { displayValue: '-', sp500Display: null, change: null, changePct: null, isPositive: true };
    return {
      displayValue: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      sp500Display: sp500Pct != null ? `${sp500Pct >= 0 ? '+' : ''}${sp500Pct.toFixed(2)}%` : null,
      change: null,
      changePct: null,
      isPositive: pct >= 0,
    };
  }
};

/** Vertical crosshair cursor rendered on hover. */
const CrosshairCursor = ({ points, height }: { points?: { x: number; y: number }[]; height?: number }) => {
  if (!points || points.length === 0) return null;
  const { x } = points[0];
  return (
    <line
      x1={x}
      x2={x}
      y1={0}
      y2={height ?? 0}
      stroke="var(--border)"
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  );
};

export const PerformanceChart = ({
  data,
  isLoading,
  currency = 'EUR',
  liveLastPoint,
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
    // S&P 500 rebasing base
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

      const effectiveFxRate = isLast && liveOverride?.fxRate != null
        ? liveOverride.fxRate
        : point.fx_rate;

      const rawReturnPct = point.return_pct;

      let returnRebased: number | null = null;
      if (rawReturnPct != null && baseReturnFactor != null && baseReturnFactor !== 0) {
        const returnFactor = useEurMode && effectiveFxRate != null
          ? (1 + rawReturnPct / 100) * effectiveFxRate
          : (1 + rawReturnPct / 100);
        returnRebased = (returnFactor / baseReturnFactor - 1) * 100;
      }
      let sp500Rebased: number | null = null;
      if (point.sp500_return_pct != null && baseSp500Factor != null && baseSp500Factor !== 0) {
        const sp500Factor = useEurMode && effectiveFxRate != null
          ? (1 + point.sp500_return_pct / 100) * effectiveFxRate
          : (1 + point.sp500_return_pct / 100);
        sp500Rebased = (sp500Factor / baseSp500Factor - 1) * 100;
      }

      const rawCurrentValue = isLast && liveOverride
        ? liveOverride.currentValue
        : point.current_value;
      const currentValue = useEurMode && effectiveFxRate != null
        ? (rawCurrentValue != null ? rawCurrentValue * effectiveFxRate : null)
        : rawCurrentValue;

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

  // Header display: show hovered point or latest point
  const headerInfo = useMemo(() => {
    if (chartData.length === 0) return null;
    const first = chartData[0];
    const displayPoint = activeIndex != null ? chartData[activeIndex] : chartData[chartData.length - 1];
    if (!displayPoint) return null;

    const values = getHeaderValues(displayPoint, first, viewMode, currency, locale, timePeriod === 'all');
    const dateStr = parseYMD(displayPoint.date).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return { ...values, date: dateStr, isHovering: activeIndex != null };
  }, [chartData, activeIndex, viewMode, currency, locale, timePeriod]);

  const handleMouseMove = useCallback((state: { activeTooltipIndex?: number }) => {
    if (state.activeTooltipIndex != null) {
      setActiveIndex(state.activeTooltipIndex);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (isLoading) {
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
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('chart.performance.title')}
            </CardTitle>
            {headerInfo?.isHovering && (
              <span className="text-xs text-muted-foreground">{headerInfo.date}</span>
            )}
          </div>
          {headerInfo && (
            <div>
              <span className="text-2xl font-bold tabular-nums">
                {headerInfo.displayValue}
              </span>
              {viewMode === 'value' && headerInfo.change != null && headerInfo.changePct != null && (
                <span className={`text-sm ml-2 ${headerInfo.isPositive ? 'text-positive' : 'text-negative'}`}>
                  {headerInfo.isPositive ? '\u25B2' : '\u25BC'}
                  {headerInfo.changePct}%
                  {' '}({headerInfo.isPositive ? '+' : '-'}{headerInfo.change})
                </span>
              )}
              {viewMode === 'value' && 'principalDisplay' in headerInfo && headerInfo.principalDisplay != null && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-[2px] mr-1 align-middle"
                    style={{ backgroundColor: 'var(--chart-2)' }}
                  />
                  {t('chart.performance.principal')}: {headerInfo.principalDisplay}
                </div>
              )}
              {viewMode !== 'value' && 'sp500Display' in headerInfo && headerInfo.sp500Display != null && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-[2px] mr-1 align-middle"
                    style={{ backgroundColor: 'var(--chart-4)' }}
                  />
                  {t('chart.performance.sp500')}: {headerInfo.sp500Display}
                </div>
              )}
            </div>
          )}
        </div>
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
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
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
            <Tooltip
              content={() => null}
              cursor={<CrosshairCursor />}
              isAnimationActive={false}
            />
            {viewMode === 'value' && (
              <Area
                type="monotone"
                dataKey="currentValue"
                fill="url(#fillPerformanceValue)"
                stroke="var(--color-currentValue)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-currentValue)' }}
                connectNulls
              />
            )}
            {viewMode === 'value' && (
              <Line
                type="monotone"
                dataKey="principal"
                stroke="var(--color-principal)"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-principal)' }}
                connectNulls
              />
            )}
            {viewMode !== 'value' && (
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
            )}
            {viewMode !== 'value' && (
              <Line
                type="monotone"
                dataKey="returnPct"
                stroke="var(--color-returnPct)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-returnPct)' }}
                connectNulls
              />
            )}
            {viewMode !== 'value' && (
              <Line
                type="monotone"
                dataKey="sp500ReturnPct"
                stroke="var(--color-sp500ReturnPct)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-sp500ReturnPct)' }}
                connectNulls
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

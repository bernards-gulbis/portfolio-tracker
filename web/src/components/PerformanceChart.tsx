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
import { formatCurrency, formatSignedCurrency, formatSignedPercent, toLocalDateStr } from '../utils/formatters';
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
import { computeBaseFactor, rebasePct } from '../utils/performanceCalc';

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
  return toLocalDateStr(cutoff);
};

/** Header display values for value mode. */
interface ValueHeaderInfo {
  mode: 'value';
  displayValue: string;
  principalDisplay: string | null;
  changeDisplay: string | null;
  pctDisplay: string;
  isPositive: boolean;
}

/** Header display values for percentage mode. */
interface PctHeaderInfo {
  mode: 'pct';
  displayValue: string;
  sp500Display: string | null;
  isPositive: boolean;
}

type HeaderInfo = ValueHeaderInfo | PctHeaderInfo;

/** Format a number as a signed percent string (e.g. "+12.34%" or "-5.67%"). */
const formatPctDisplay = (pct: number): string =>
  `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

const EMPTY_VALUE_HEADER: ValueHeaderInfo = {
  mode: 'value', displayValue: '-', principalDisplay: null, changeDisplay: null, pctDisplay: '', isPositive: true,
};

/** Header values for absolute-value mode. */
const getValueHeaderInfo = (
  point: ChartDataPoint,
  first: ChartDataPoint,
  currency: Currency,
  locale: string,
  isAllTime: boolean,
): ValueHeaderInfo => {
  const value = point.currentValue;
  if (value == null) return EMPTY_VALUE_HEADER;

  const formatted = formatCurrency(value, currency, locale);
  const principalDisplay = point.principal != null ? formatCurrency(point.principal, currency, locale) : null;
  const base = isAllTime ? point.principal : first.currentValue;
  if (base == null) return { ...EMPTY_VALUE_HEADER, displayValue: formatted, principalDisplay };

  const diff = value - base;
  return {
    mode: 'value',
    displayValue: formatted,
    principalDisplay,
    changeDisplay: formatSignedCurrency(diff, currency, locale),
    pctDisplay: formatSignedPercent(point.returnPct),
    isPositive: diff >= 0,
  };
};

/** Header values for percentage mode. */
const getPctHeaderInfo = (point: ChartDataPoint): PctHeaderInfo => {
  const { returnPct: pct, sp500ReturnPct: sp500Pct } = point;
  if (pct == null) return { mode: 'pct', displayValue: '-', sp500Display: null, isPositive: true };
  return {
    mode: 'pct',
    displayValue: formatPctDisplay(pct),
    sp500Display: sp500Pct != null ? formatPctDisplay(sp500Pct) : null,
    isPositive: pct >= 0,
  };
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
): HeaderInfo => {
  if (viewMode === 'value') {
    return getValueHeaderInfo(point, first, currency, locale, isAllTime);
  }
  return getPctHeaderInfo(point);
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

/** Active dot config for chart series. Primary series use r=5, secondary use r=4. */
const makeActiveDot = (colorVar: string, primary = true) => ({
  r: primary ? 5 : 4,
  strokeWidth: 2,
  stroke: 'var(--background)',
  fill: colorVar,
});

// Pre-computed active dot configs — avoids creating new object references on every render.
const ACTIVE_DOT_VALUE = makeActiveDot('var(--color-currentValue)');
const ACTIVE_DOT_PRINCIPAL = makeActiveDot('var(--color-principal)', false);
const ACTIVE_DOT_RETURN = makeActiveDot('var(--color-returnPct)');
const ACTIVE_DOT_SP500 = makeActiveDot('var(--color-sp500ReturnPct)', false);

const CHART_MARGIN = { left: 12, right: 12 };

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
    const baseReturnFactor = computeBaseFactor(filtered, p => p.return_pct, useEurMode);
    const baseSp500Factor = computeBaseFactor(filtered, p => p.sp500_return_pct, useEurMode);

    return filtered.map((point, index) => {
      const isLast = index === filtered.length - 1;
      const liveOverride = isLast ? liveLastPoint : undefined;

      const effectiveFxRate = isLast && liveOverride?.fxRate != null
        ? liveOverride.fxRate
        : point.fx_rate;

      const returnRebased = rebasePct(point.return_pct, effectiveFxRate, baseReturnFactor, useEurMode);
      const sp500Rebased = rebasePct(point.sp500_return_pct, effectiveFxRate, baseSp500Factor, useEurMode);

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

  const xAxisTickFormatter = useCallback(
    (value: string) => parseYMD(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    [locale],
  );

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
              {headerInfo.mode === 'value' && headerInfo.changeDisplay != null && (
                <span className={`text-sm ml-2 ${headerInfo.isPositive ? 'text-positive' : 'text-negative'}`}>
                  {headerInfo.changeDisplay}
                  {headerInfo.pctDisplay && <span className="font-bold ml-1.5">{headerInfo.pctDisplay}</span>}
                </span>
              )}
              {headerInfo.mode === 'value' && headerInfo.principalDisplay != null && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-[2px] mr-1 align-middle"
                    style={{ backgroundColor: 'var(--chart-2)' }}
                  />
                  {t('chart.performance.principal')}: {headerInfo.principalDisplay}
                </div>
              )}
              {headerInfo.mode === 'pct' && headerInfo.sp500Display != null && (
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
            margin={CHART_MARGIN}
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
              tickFormatter={xAxisTickFormatter}
              minTickGap={50}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={viewMode === 'value' ? 60 : 50}
              tickFormatter={viewMode === 'value'
                ? (v: number) => formatCompactValue(v, currency)
                : (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`
              }
            />
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
                activeDot={ACTIVE_DOT_VALUE}
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
                activeDot={ACTIVE_DOT_PRINCIPAL}
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
                activeDot={ACTIVE_DOT_RETURN}
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
                activeDot={ACTIVE_DOT_SP500}
                connectNulls
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

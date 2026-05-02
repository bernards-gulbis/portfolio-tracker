import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { Currency } from '../../hooks/useCurrencyPreference';
import { useLocale } from '../../hooks/useLocale';
import { formatCompactValue } from '../../utils/chartHelpers';
import {
  ACTIVE_DOT_PRINCIPAL,
  ACTIVE_DOT_RETURN,
  ACTIVE_DOT_SP500,
  ACTIVE_DOT_VALUE,
  CHART_MARGIN,
} from './chartConstants';
import { CrosshairCursor } from './CrosshairCursor';
import { parseYMD } from './headerInfo';
import type { ChartDataPoint, ViewMode } from './types';

interface Props {
  chartConfig: ChartConfig;
  chartData: ChartDataPoint[];
  viewMode: ViewMode;
  currency: Currency;
  onMouseMove: (state: { activeTooltipIndex?: number | string | null }) => void;
  onMouseLeave: () => void;
}

export const PerformanceChartCanvas = ({
  chartConfig,
  chartData,
  viewMode,
  currency,
  onMouseMove,
  onMouseLeave,
}: Props) => {
  const { t } = useTranslation();
  const locale = useLocale();

  const xAxisTickFormatter = useCallback(
    (value: string) => parseYMD(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    [locale],
  );

  return (
    <ChartContainer
      config={chartConfig}
      className="h-[300px] w-full"
      aria-label={t('chart.performance.title')}
    >
      <ComposedChart
        accessibilityLayer
        data={chartData}
        margin={CHART_MARGIN}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
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
          tickFormatter={
            viewMode === 'value'
              ? (v: number) => formatCompactValue(v, currency)
              : (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`
          }
        />
        <Tooltip content={() => null} cursor={<CrosshairCursor />} isAnimationActive={false} />
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
  );
};

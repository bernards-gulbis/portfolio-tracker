import { useMemo, useState, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Sector,
  Label,
} from 'recharts';
import type { PieSectorShapeProps } from 'recharts/types/polar/Pie';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import type { ViewBox } from 'recharts/types/util/types';
import { PricedHolding } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';

interface HoldingsAllocationChartProps {
  holdings: PricedHolding[];
  cash: number;
  eurRate?: number | null;
  isLoading?: boolean;
}

interface PieCenterLabelProps {
  viewBox?: ViewBox;
  locale: string;
  currency: string;
  activeEntry: { name: string; value: number } | null;
  total: number;
  totalLabel: string;
}

const PieCenterLabel = ({ viewBox, locale, currency, activeEntry, total, totalLabel }: PieCenterLabelProps) => {
  if (!(viewBox && 'cx' in viewBox && 'cy' in viewBox)) return null;
  const cx = viewBox.cx || 0;
  const cy = viewBox.cy || 0;

  if (activeEntry) {
    const pct = total > 0 ? ((activeEntry.value / total) * 100).toFixed(1) : '0.0';
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
        <tspan x={cx} y={cy - 18} className="fill-muted-foreground text-[11px]">
          {activeEntry.name}
        </tspan>
        <tspan x={cx} y={cy + 4} className="fill-foreground text-base font-bold">
          {formatCurrency(activeEntry.value, currency, locale)}
        </tspan>
        <tspan x={cx} y={cy + 22} className="fill-muted-foreground text-xs">
          {pct}%
        </tspan>
      </text>
    );
  }

  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} y={cy - 10} className="fill-foreground text-base font-bold">
        {formatCurrency(total, currency, locale)}
      </tspan>
      <tspan x={cx} y={cy + 14} className="fill-muted-foreground text-xs">
        {totalLabel}
      </tspan>
    </text>
  );
};

const TRANSITION_STYLE = { transition: 'opacity 150ms ease-in-out' };

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

export const HoldingsAllocationChart = ({
  holdings,
  cash,
  eurRate,
  isLoading,
}: HoldingsAllocationChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { chartData, total, chartConfig, currency } = useMemo(() => {
    const useEur = eurRate != null && eurRate > 0;
    const currency = useEur ? 'EUR' : 'USD';
    const data: Array<{ name: string; value: number; fill: string }> = [];

    const cashValue = useEur ? cash * eurRate : cash;
    if (cashValue > 0) {
      data.push({ name: 'CASH', value: cashValue, fill: COLORS[0] });
    }

    holdings.forEach((holding) => {
      const rawValue = holding.current_value;
      const value = useEur && rawValue != null ? rawValue * eurRate : rawValue;
      if (value && value > 0) {
        const index = data.length;
        data.push({ name: holding.ticker, value, fill: COLORS[index % COLORS.length] });
      }
    });

    const total = data.reduce((sum, item) => sum + item.value, 0);

    const config = data.reduce((acc, entry) => {
      acc[entry.name] = {
        label: entry.name,
        color: entry.fill,
      };
      return acc;
    }, {} as ChartConfig);

    return { chartData: data, total, chartConfig: config, currency };
  }, [holdings, cash, eurRate]);

  const handleMouseEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-20" />
        </CardHeader>
        <CardContent>
          <div className="flex justify-center mb-3">
            <Skeleton className="h-[240px] w-[240px] rounded-full" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('chart.allocation.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('chart.allocation.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const activeEntry = activeIndex == null ? null : chartData[activeIndex];

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t('chart.allocation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[240px] w-full min-h-[200px]">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={72}
              outerRadius={108}
              strokeWidth={2}
              stroke="var(--card)"
              shape={(props: PieSectorShapeProps) => <Sector {...props} opacity={activeIndex == null || props.index === activeIndex ? 1 : 0.3} style={TRANSITION_STYLE} />}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Label
                content={
                  <PieCenterLabel
                    locale={locale}
                    currency={currency}
                    activeEntry={activeEntry}
                    total={total}
                    totalLabel={t('chart.allocation.marketValue')}
                  />
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="mt-3 space-y-1.5 list-none p-0 m-0">
          {chartData.map((entry, index) => {
            const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
            const dimmed = activeIndex != null && activeIndex !== index;
            return (
              <li
                key={entry.name}
                className="flex items-center justify-between text-xs cursor-default"
                style={{ opacity: dimmed ? 0.3 : 1, ...TRANSITION_STYLE }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entry.fill }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{formatCurrency(entry.value, currency, locale)}</span>
                  <span className="font-semibold w-12 text-right">{percentage}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

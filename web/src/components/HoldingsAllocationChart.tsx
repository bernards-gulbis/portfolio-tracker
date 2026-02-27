import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Label,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import type { ViewBox } from 'recharts/types/util/types';
import { Holding } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

interface HoldingsAllocationChartProps {
  holdings: Holding[];
  cash: number;
  cash_eur?: number | null;
  loading?: boolean;
}

interface PieCenterLabelProps {
  viewBox?: ViewBox;
  total: number;
  locale: string;
  currency: string;
  label: string;
}

const PieCenterLabel = ({ viewBox, total, locale, currency, label }: PieCenterLabelProps) => {
  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
    return (
      <text
        x={viewBox.cx}
        y={viewBox.cy}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        <tspan
          x={viewBox.cx}
          y={(viewBox.cy || 0) - 10}
          className="fill-foreground text-base font-bold"
        >
          {formatCurrency(total, currency, locale)}
        </tspan>
        <tspan
          x={viewBox.cx}
          y={(viewBox.cy || 0) + 14}
          className="fill-muted-foreground text-xs"
        >
          {label}
        </tspan>
      </text>
    );
  }
  return null;
};

const COLORS = [
  '#4f6ef7',
  '#5bc87c',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#14b8a6',
  '#f97316',
  '#06b6d4',
  '#e6fd7f',
  '#84cc16',
];

export const HoldingsAllocationChart = ({
  holdings,
  cash,
  cash_eur,
  loading,
}: HoldingsAllocationChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();

  const { chartData, total, chartConfig, currency } = useMemo(() => {
    const useEur = cash_eur != null || holdings.some((h) => h.current_value_eur != null);
    const currency = useEur ? 'EUR' : 'USD';
    const data: Array<{ name: string; value: number; fill: string }> = [];

    const cashValue = useEur && cash_eur != null ? cash_eur : cash;
    if (cashValue > 0) {
      data.push({ name: 'CASH', value: cashValue, fill: COLORS[0] });
    }

    holdings.forEach((holding) => {
      const value = useEur ? (holding.current_value_eur ?? holding.current_value) : holding.current_value;
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
  }, [holdings, cash, cash_eur]);

  if (loading) {
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

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t('chart.allocation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[240px] w-full min-h-[200px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value) => formatCurrency(value as number, currency, locale)}
                />
              }
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={72}
              outerRadius={108}
              strokeWidth={2}
              stroke="var(--card)"
            >
              <Label
                content={
                  <PieCenterLabel
                    total={total}
                    locale={locale}
                    currency={currency}
                    label={t('chart.allocation.marketValue')}
                  />
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-3 space-y-1.5">
          {chartData.map((entry) => {
            const percentage = ((entry.value / total) * 100).toFixed(1);
            return (
              <div key={entry.name} className="flex items-center justify-between text-xs">
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

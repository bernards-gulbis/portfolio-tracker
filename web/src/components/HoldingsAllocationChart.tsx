import {
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
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
  loading?: boolean;
}

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
  loading,
}: HoldingsAllocationChartProps) => {
  const { t } = useTranslation();
  const locale = useLocale();

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

  const chartData: Array<{ name: string; value: number }> = [];

  if (cash > 0) {
    chartData.push({ name: 'CASH', value: cash });
  }

  holdings.forEach((holding) => {
    if (holding.current_value && holding.current_value > 0) {
      chartData.push({ name: holding.ticker, value: holding.current_value });
    }
  });

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

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const chartConfig = chartData.reduce((acc, entry, index) => {
    acc[entry.name] = {
      label: entry.name,
      color: COLORS[index % COLORS.length],
    };
    return acc;
  }, {} as ChartConfig);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('chart.allocation.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer config={chartConfig} className="h-[240px]">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                innerRadius={72}
                outerRadius={108}
                dataKey="value"
                strokeWidth={2}
                stroke="var(--card)"
              >
                {chartData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value) => formatCurrency(value as number, 'EUR', locale)}
                  />
                }
              />
            </PieChart>
          </ChartContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t('chart.allocation.marketValue')}</p>
              <p className="text-base font-bold">{formatCurrency(total, 'EUR', locale)}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {chartData.map((entry, index) => {
            const percentage = ((entry.value / total) * 100).toFixed(1);
            return (
              <div key={entry.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{formatCurrency(entry.value, 'EUR', locale)}</span>
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

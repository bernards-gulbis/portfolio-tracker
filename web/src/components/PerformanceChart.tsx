import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

interface PerformanceDataPoint {
  date: string;
  principal_eur: number;
  current_value_eur: number | null;
}

export type TimePeriod = 'all' | '1month';

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  loading?: boolean;
  selectedPeriod?: TimePeriod;
  onPeriodChange?: (period: TimePeriod) => void;
}

const chartConfig = {
  principal: {
    label: 'Principal (EUR)',
    color: 'var(--chart-2)',
  },
  currentValue: {
    label: 'Current Value (EUR)',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export const PerformanceChart = ({
  data,
  loading,
  selectedPeriod = 'all',
  onPeriodChange,
}: PerformanceChartProps) => {
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
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No performance data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((point) => ({
    date: point.date,
    principal: point.principal_eur,
    currentValue: point.current_value_eur,
  }));

  const formatYAxis = (value: number) => {
    if (value >= 1000000) return `€${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(2)}K`;
    return `€${value.toFixed(0)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        {onPeriodChange && (
          <CardAction>
            <Tabs value={selectedPeriod} onValueChange={(v) => onPeriodChange(v as TimePeriod)}>
              <TabsList>
                <TabsTrigger value="1month">1M</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <LineChart data={chartData} margin={{ top: 8, right: 72, left: 0, bottom: 0 }}>
            <CartesianGrid
              horizontal={true}
              vertical={false}
              strokeDasharray="2 6"
              stroke="var(--border)"
            />
            <XAxis dataKey="date" hide={true} />
            <YAxis
              orientation="right"
              tickFormatter={formatYAxis}
              axisLine={false}
              tickLine={false}
              width={68}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    value != null ? formatCurrency(value as number, 'EUR') : 'N/A'
                  }
                />
              }
            />
            <Line
              type="monotone"
              dataKey="principal"
              stroke="var(--color-principal)"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="currentValue"
              stroke="var(--color-currentValue)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

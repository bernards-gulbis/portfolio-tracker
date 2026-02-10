import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';

interface Holding {
  ticker: string;
  quantity: number;
  average_cost: number;
  total_cost: number;
  current_price?: number | null;
  current_value?: number | null;
  unrealized_gain_loss?: number | null;
  unrealized_gain_loss_percent?: number | null;
}

interface HoldingsAllocationChartProps {
  holdings: Holding[];
  cash: number;
  loading?: boolean;
}

// Color palette for the pie chart
const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
];

export const HoldingsAllocationChart: React.FC<HoldingsAllocationChartProps> = ({
  holdings,
  cash,
  loading,
}) => {
  if (loading) {
    return (
      <div className="allocation-chart">
        <h3>Allocation</h3>
        <p>Loading chart data...</p>
      </div>
    );
  }

  // Prepare data for pie chart
  const chartData: Array<{ name: string; value: number }> = [];
  
  // Add cash if it exists
  if (cash > 0) {
    chartData.push({
      name: 'CASH',
      value: cash,
    });
  }

  // Add holdings with current values
  holdings.forEach((holding) => {
    if (holding.current_value && holding.current_value > 0) {
      chartData.push({
        name: holding.ticker,
        value: holding.current_value,
      });
    }
  });

  if (chartData.length === 0) {
    return (
      <div className="allocation-chart">
        <h3>Allocation</h3>
        <p>No allocation data available</p>
      </div>
    );
  }

  // Calculate total for percentages
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const percentage = ((data.value / total) * 100).toFixed(1);
      return (
        <div
          style={{
            backgroundColor: 'var(--background)',
            padding: '10px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {data.name}
          </p>
          <p style={{ margin: '3px 0', color: 'var(--text-primary)' }}>
            Value: {formatCurrency(data.value, 'USD')}
          </p>
          <p style={{ margin: '3px 0', color: 'var(--text-secondary)' }}>
            {percentage}% of portfolio
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom label to show percentages
  const renderLabel = (entry: any) => {
    const percentage = ((entry.value / total) * 100).toFixed(1);
    return `${percentage}%`;
  };

  return (
    <div className="allocation-chart">
      <h3>Allocation</h3>
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            innerRadius={70}
            outerRadius={120}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value, entry: any) => {
              const percentage = ((entry.payload.value / total) * 100).toFixed(1);
              return `${value} (${percentage}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

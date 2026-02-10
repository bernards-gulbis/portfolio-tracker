import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';

interface PerformanceDataPoint {
  date: string;
  principal_eur: number;
  current_value_eur: number | null;
}

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  loading?: boolean;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="performance-chart">
        <h3>Performance</h3>
        <p>Loading chart data...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="performance-chart">
        <h3>Performance</h3>
        <p>No performance data available</p>
      </div>
    );
  }

  // Format data for Recharts - handle null values
  const chartData = data.map((point) => ({
    date: point.date,
    'Principal (EUR)': point.principal_eur,
    'Current Value (EUR)': point.current_value_eur,
  }));

  // Custom tooltip to format values
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: 'white',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={`item-${index}`}
              style={{
                margin: '3px 0',
                color: entry.color,
              }}
            >
              {entry.name}: {entry.value !== null ? formatCurrency(entry.value, 'EUR') : 'N/A'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Format Y-axis values
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `€${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `€${(value / 1000).toFixed(1)}K`;
    }
    return `€${value.toFixed(0)}`;
  };

  // Format X-axis to show only month/year for better readability
  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="performance-chart">
      <h3>Performance</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tickFormatter={formatYAxis} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="Principal (EUR)"
            stroke="#8884d8"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Current Value (EUR)"
            stroke="#82ca9d"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

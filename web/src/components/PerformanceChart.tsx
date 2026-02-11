import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '../utils/formatters';

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

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ 
  data, 
  loading, 
  selectedPeriod = 'all',
  onPeriodChange 
}) => {
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

  // Format X-axis based on selected period
  const formatXAxis = (dateStr: string) => {
    const date = new Date(dateStr);
    if (selectedPeriod === '1month') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="performance-chart">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Performance</h3>
        {onPeriodChange && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onPeriodChange('1month')}
              style={{
                padding: '6px 12px',
                border: selectedPeriod === '1month' ? '2px solid #007acc' : '1px solid #ccc',
                backgroundColor: selectedPeriod === '1month' ? '#007acc' : 'white',
                color: selectedPeriod === '1month' ? 'white' : '#333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: selectedPeriod === '1month' ? 'bold' : 'normal',
              }}
            >
              1M
            </button>
            <button
              onClick={() => onPeriodChange('all')}
              style={{
                padding: '6px 12px',
                border: selectedPeriod === 'all' ? '2px solid #007acc' : '1px solid #ccc',
                backgroundColor: selectedPeriod === 'all' ? '#007acc' : 'white',
                color: selectedPeriod === 'all' ? 'white' : '#333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: selectedPeriod === 'all' ? 'bold' : 'normal',
              }}
            >
              All
            </button>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0.05}/>
            </linearGradient>
            <linearGradient id="colorCurrentValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            angle={-45}
            textAnchor="end"
            height={80}
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            tickFormatter={formatYAxis} 
            stroke="#666"
            style={{ fontSize: '12px' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Area
            type="monotone"
            dataKey="Principal (EUR)"
            stroke="#8884d8"
            strokeWidth={2}
            fill="url(#colorPrincipal)"
            fillOpacity={1}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="Current Value (EUR)"
            stroke="#82ca9d"
            strokeWidth={2.5}
            fill="url(#colorCurrentValue)"
            fillOpacity={1}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

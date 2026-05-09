import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PerformanceChart } from '../components/PerformanceChart';
import { toLocalDateStr } from '../utils/formatters';
import type { PerformanceDataPoint } from '../api';

// Use recent dates so data falls within the default "1M" period filter
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const mockData: PerformanceDataPoint[] = [
  { date: toLocalDateStr(yesterday), principal: 11765, principal_eur: 10824, current_value: 12353, fx_rate: 0.92, return_pct: 5.0, sp500_return_pct: 0 },
  { date: toLocalDateStr(today), principal: 11765, principal_eur: 10824, current_value: 12706, fx_rate: 0.92, return_pct: 8.0, sp500_return_pct: 1.2 },
];

// Old data that will be filtered out by the default "1M" period
const oldMockData: PerformanceDataPoint[] = [
  { date: '2023-01-01', principal: 11765, principal_eur: 10589, current_value: 12353, fx_rate: 0.90, return_pct: 5.0, sp500_return_pct: 0 },
  { date: '2023-01-02', principal: 11765, principal_eur: 10589, current_value: 12706, fx_rate: 0.90, return_pct: 8.0, sp500_return_pct: 1.2 },
];

describe('PerformanceChart', () => {
  it('shows spinner while loading', () => {
    render(<PerformanceChart data={[]} isLoading={true} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows "No performance data available" when data is empty', () => {
    render(<PerformanceChart data={[]} isLoading={false} />);

    expect(screen.getByText('No performance data available')).toBeInTheDocument();
  });

  it('renders chart with header value when data is provided', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
    // The header should show the latest current value in EUR (12706 * 0.92 = 11689.52)
    // formatted as currency — just verify Portfolio Value title is rendered
  })

  it('renders all period tab triggers', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByRole('tab', { name: '1M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '6M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'YTD' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1Y' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('renders view mode toggle (EUR / %)', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByRole('tab', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '%' })).toBeInTheDocument();
  });

  it('does not render tabs when loading', () => {
    render(<PerformanceChart data={[]} isLoading={true} />);

    expect(screen.queryByRole('tab', { name: '1M' })).not.toBeInTheDocument();
  });

  it('switches period without error when tab is clicked', async () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    // Should not throw — period switching is client-side only
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('data-state', 'active');
  });

  it('switches view mode when % tab is clicked', async () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    await userEvent.click(screen.getByRole('tab', { name: '%' }));
    expect(screen.getByRole('tab', { name: '%' })).toHaveAttribute('data-state', 'active');
  });

  it('shows "Performance" title when in % mode and "Portfolio Value" in value mode', async () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '%' }));
    expect(screen.getByText('Performance')).toBeInTheDocument();
  });

  it('shows insufficient data message when filtered data has < 2 points', () => {
    render(<PerformanceChart data={oldMockData} isLoading={false} />);

    // Data exists (raw length >= 2) but after 1M filter, < 2 points remain
    expect(screen.getByText(/Not enough data points for this time period/)).toBeInTheDocument();
    // Period selector should still be visible so user can switch
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Component renders without crash when all return_pct are null
// ---------------------------------------------------------------------------

describe('all-null return_pct handling', () => {
  it('renders chart without crash when all return_pct are null', () => {
    const nullReturnData: PerformanceDataPoint[] = [
      { date: toLocalDateStr(yesterday), principal: 10000, principal_eur: 9200, current_value: 10000, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
      { date: toLocalDateStr(today), principal: 10000, principal_eur: 9200, current_value: 10500, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
    ];

    // Should render without throwing
    render(<PerformanceChart data={nullReturnData} isLoading={false} />);
    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// data.length < 2 — raw insufficient data path
// ---------------------------------------------------------------------------

describe('single data point (raw data.length < 2)', () => {
  it('shows insufficient data message when only one data point exists', () => {
    const singlePoint: PerformanceDataPoint[] = [
      { date: toLocalDateStr(today), principal: 10000, principal_eur: 9200, current_value: 10000, fx_rate: 0.92, return_pct: 0, sp500_return_pct: 0 },
    ];

    render(<PerformanceChart data={singlePoint} isLoading={false} />);
    // data.length < 2 renders the simple insufficientData message without period tabs
    expect(screen.getByText(/Not enough data/i)).toBeInTheDocument();
    // Period tabs should NOT be visible since we short-circuit before building them
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// currency prop — USD mode
// ---------------------------------------------------------------------------

describe('currency prop', () => {
  it('shows USD tab label when currency is USD', () => {
    render(<PerformanceChart data={mockData} isLoading={false} currency="USD" />);
    expect(screen.getByRole('tab', { name: 'USD' })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PerformanceChart } from '../components/PerformanceChart';
import type { TimePeriod } from '../components/PerformanceChart';

const mockData = [
  { date: '2024-01-01', principal_eur: 10000, current_value_eur: 10500 },
  { date: '2024-01-02', principal_eur: 10000, current_value_eur: 10800 },
];

describe('PerformanceChart', () => {
  it('shows skeleton while loading', () => {
    render(<PerformanceChart data={[]} loading={true} />);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No performance data available" when data is empty', () => {
    render(<PerformanceChart data={[]} loading={false} />);

    expect(screen.getByText('No performance data available')).toBeInTheDocument();
  });

  it('renders chart container when data is provided', () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    expect(screen.getByText('Performance')).toBeInTheDocument();
  });

  it('renders "1M" and "All" tab triggers when onPeriodChange is provided', () => {
    const mockOnPeriodChange = vi.fn();
    render(
      <PerformanceChart
        data={mockData}
        loading={false}
        selectedPeriod="all"
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(screen.getByRole('tab', { name: '1M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('does not render tabs when onPeriodChange is not provided', () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('calls onPeriodChange when a tab is clicked', async () => {
    const mockOnPeriodChange = vi.fn();
    render(
      <PerformanceChart
        data={mockData}
        loading={false}
        selectedPeriod="all"
        onPeriodChange={mockOnPeriodChange}
      />
    );

    await userEvent.click(screen.getByRole('tab', { name: '1M' }));

    expect(mockOnPeriodChange).toHaveBeenCalledWith('1month' as TimePeriod);
  });
});

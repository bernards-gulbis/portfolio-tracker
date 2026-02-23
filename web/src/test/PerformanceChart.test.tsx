import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PerformanceChart } from '../components/PerformanceChart';

const mockData = [
  { date: '2024-01-01', principal_eur: 10000, current_value_eur: 10500, return_pct: 5.0 },
  { date: '2024-01-02', principal_eur: 10000, current_value_eur: 10800, return_pct: 8.0 },
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

  it('renders all period tab triggers', () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    expect(screen.getByRole('tab', { name: '1M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '6M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'YTD' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1Y' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('renders view mode toggle (EUR / %)', () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    expect(screen.getByRole('tab', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '%' })).toBeInTheDocument();
  });

  it('does not render tabs when loading', () => {
    render(<PerformanceChart data={[]} loading={true} />);

    expect(screen.queryByRole('tab', { name: '1M' })).not.toBeInTheDocument();
  });

  it('switches period without error when tab is clicked', async () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    // Should not throw — period switching is client-side only
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('data-state', 'active');
  });

  it('switches view mode when % tab is clicked', async () => {
    render(<PerformanceChart data={mockData} loading={false} />);

    await userEvent.click(screen.getByRole('tab', { name: '%' }));
    expect(screen.getByRole('tab', { name: '%' })).toHaveAttribute('data-state', 'active');
  });
});

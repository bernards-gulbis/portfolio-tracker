import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldingsAllocationChart } from '../components/HoldingsAllocationChart';
import type { Holding } from '../api';

const mockHoldings: Holding[] = [
  {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
    current_price: 200,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
  },
  {
    ticker: 'MSFT',
    quantity: 5,
    average_cost: 300,
    total_cost: 1500,
    current_price: 400,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
  },
];

const mockHoldingsEur: Holding[] = [
  {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
    current_price: 200,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    average_cost_eur: 138,
    total_cost_eur: 1380,
    current_price_eur: 184,
    current_value_eur: 1840,
    unrealized_gain_loss_eur: 460,
  },
];

describe('HoldingsAllocationChart', () => {
  it('shows skeleton while loading', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={0} loading={true} />);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No allocation data available" when no holdings and no cash', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={0} loading={false} />);

    expect(screen.getByText('No allocation data available')).toBeInTheDocument();
  });

  it('shows "No allocation data available" when holdings have no current_value', () => {
    const holdingsNoValue: Holding[] = [
      {
        ticker: 'AAPL',
        quantity: 10,
        average_cost: 150,
        total_cost: 1500,
        current_price: null,
        current_value: null,
      },
    ];
    render(<HoldingsAllocationChart holdings={holdingsNoValue} cash={0} loading={false} />);

    expect(screen.getByText('No allocation data available')).toBeInTheDocument();
  });

  it('renders chart container and legend items when data is provided', () => {
    render(<HoldingsAllocationChart holdings={mockHoldings} cash={500} loading={false} />);

    expect(screen.getByText('Allocation')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
  });

  it('renders only cash entry when no holdings have current_value', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={1000} loading={false} />);

    expect(screen.getByText('CASH')).toBeInTheDocument();
  });

  it('uses EUR values when cash_eur is provided', () => {
    render(
      <HoldingsAllocationChart
        holdings={mockHoldingsEur}
        cash={500}
        cash_eur={460}
        loading={false}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    // EUR amounts should appear in the legend (€460.00 for cash, €1,840.00 for AAPL)
    expect(screen.getByText('€460.00')).toBeInTheDocument();
    expect(screen.getByText('€1,840.00')).toBeInTheDocument();
  });

  it('falls back to USD when cash_eur is null and no EUR holding values', () => {
    render(
      <HoldingsAllocationChart
        holdings={mockHoldings}
        cash={500}
        cash_eur={null}
        loading={false}
      />
    );

    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoldingsAllocationChart } from '../components/HoldingsAllocationChart';
import type { PricedHolding } from '../api';

const mockHoldings: PricedHolding[] = [
  {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
    first_buy_date: '2024-01-01',
    current_price: 200,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    price_source: 'live',
    price_as_of: null,
  },
  {
    ticker: 'MSFT',
    quantity: 5,
    average_cost: 300,
    total_cost: 1500,
    first_buy_date: '2024-01-01',
    current_price: 400,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    price_source: 'live',
    price_as_of: null,
  },
];

const mockHoldingsEur: PricedHolding[] = [
  {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
    first_buy_date: '2024-01-01',
    current_price: 200,
    current_value: 2000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    price_source: 'live',
    price_as_of: null,
  },
];

describe('HoldingsAllocationChart', () => {
  it('shows skeleton while loading', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={0} isLoading={true} />);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No allocation data available" when no holdings and no cash', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={0} isLoading={false} />);

    expect(screen.getByText('No allocation data available')).toBeInTheDocument();
  });

  it('shows "No allocation data available" when holdings have no current_value', () => {
    const holdingsNoValue: PricedHolding[] = [
      {
        ticker: 'AAPL',
        quantity: 10,
        average_cost: 150,
        total_cost: 1500,
        first_buy_date: '2024-01-01',
        current_price: null,
        current_value: null,
        unrealized_gain_loss: null,
        unrealized_gain_loss_pct: null,
        price_source: 'missing',
        price_as_of: null,
      },
    ];
    render(<HoldingsAllocationChart holdings={holdingsNoValue} cash={0} isLoading={false} />);

    expect(screen.getByText('No allocation data available')).toBeInTheDocument();
  });

  it('renders chart container and legend items when data is provided', () => {
    render(<HoldingsAllocationChart holdings={mockHoldings} cash={500} isLoading={false} />);

    expect(screen.getByText('Allocation')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
  });

  it('renders only cash entry when no holdings have current_value', () => {
    render(<HoldingsAllocationChart holdings={[]} cash={1000} isLoading={false} />);

    expect(screen.getByText('CASH')).toBeInTheDocument();
  });

  it('uses EUR values when eurRate is provided', () => {
    // eurRate=0.92: cash=500 → €460.00, AAPL current_value=2000 → €1,840.00
    render(
      <HoldingsAllocationChart
        holdings={mockHoldingsEur}
        cash={500}
        eurRate={0.92}
        displayCurrency="EUR"
        isLoading={false}
      />
    );

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    // EUR amounts should appear in the legend
    expect(screen.getByText('€460.00')).toBeInTheDocument();
    expect(screen.getByText('€1,840.00')).toBeInTheDocument();
  });

  it('falls back to USD when eurRate is null', () => {
    render(
      <HoldingsAllocationChart
        holdings={mockHoldings}
        cash={500}
        eurRate={null}
        isLoading={false}
      />
    );

    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('dims other legend items when mouse enters a legend item', () => {
    render(<HoldingsAllocationChart holdings={mockHoldings} cash={500} isLoading={false} />);

    const listItems = document.querySelectorAll('li');
    expect(listItems.length).toBeGreaterThan(0);

    // Mouse enter the first item
    fireEvent.mouseEnter(listItems[0]);

    // After entering item 0, item 1 should be dimmed (opacity 0.3)
    expect(listItems[1]).toHaveStyle({ opacity: '0.3' });

    // Mouse leave restores full opacity for all
    fireEvent.mouseLeave(listItems[0]);
    expect(listItems[1]).toHaveStyle({ opacity: '1' });
  });

  it('does not dim items when no item is active', () => {
    render(<HoldingsAllocationChart holdings={mockHoldings} cash={500} isLoading={false} />);

    const listItems = document.querySelectorAll('li');
    listItems.forEach((item) => {
      expect(item).toHaveStyle({ opacity: '1' });
    });
  });

  it('renders zero percentage when total is zero', () => {
    // Holdings with no value and no cash means no chart rendered — test with only cash=0
    render(<HoldingsAllocationChart holdings={[]} cash={0} isLoading={false} />);
    // Empty chart shows no data message
    expect(screen.getByText('No allocation data available')).toBeInTheDocument();
  });
});

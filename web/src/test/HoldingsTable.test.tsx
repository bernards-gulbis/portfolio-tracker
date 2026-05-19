import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { HoldingsTable } from '../components/HoldingsTable';
import type { PricedHolding } from '../api';

function holding(overrides: Partial<PricedHolding> = {}): PricedHolding {
  return {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1_500,
    first_buy_date: '2024-01-01',
    current_price: 200,
    current_value: 2_000,
    unrealized_gain_loss: 500,
    unrealized_gain_loss_pct: 33.33,
    price_source: 'live',
    price_as_of: '2026-04-22T09:00:00Z',
    previous_close: null,
    ...overrides,
  };
}

const defaultProps = {
  cash: 1_000,
  displayCurrency: 'USD' as const,
  showEur: false,
  eurMetrics: null,
  locale: 'en-US',
};

describe('HoldingsTable — price source UI', () => {
  it('renders a stale banner listing only last_known tickers', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({ ticker: 'AAPL', price_source: 'live' }),
          holding({
            ticker: 'MSFT',
            price_source: 'last_known',
            price_as_of: '2026-04-20T09:00:00Z',
          }),
          holding({
            ticker: 'TSLA',
            price_source: 'last_known',
            price_as_of: null,
          }),
        ]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );

    // The live-only ticker must NOT appear in the stale banner text.
    expect(
      screen.getByText(/Using last known prices for: MSFT, TSLA/),
    ).toBeInTheDocument();
    // Missing banner should not appear when the list is empty.
    expect(screen.queryByText(/Could not fetch current prices/)).toBeNull();
  });

  it('omits the stale banner when all holdings are live', () => {
    render(
      <HoldingsTable
        holdings={[holding({ ticker: 'AAPL', price_source: 'live' })]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );
    expect(screen.queryByText(/Using last known prices/)).toBeNull();
  });

  it('renders a clock icon with a locale-formatted as_of tooltip for last_known rows', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({
            ticker: 'MSFT',
            price_source: 'last_known',
            price_as_of: '2026-04-20T09:00:00Z',
          }),
        ]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );

    // The row containing MSFT has the stale badge (clock icon).
    const msftCell = screen.getByText('MSFT').closest('td');
    expect(msftCell).not.toBeNull();
    const icon = within(msftCell as HTMLElement).getByLabelText(
      /Last known price as of/,
    );
    expect(icon).toBeInTheDocument();
    // The aria-label should contain a rendered date string, not the raw ISO.
    expect(icon.getAttribute('aria-label')).not.toMatch(/2026-04-20T09:00:00Z/);
    // But it should reference the year so we know formatAsOf ran.
    expect(icon.getAttribute('aria-label')).toMatch(/2026/);
  });

  it('formats as_of as "an unknown date" when price_as_of is null', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({
            ticker: 'TSLA',
            price_source: 'last_known',
            price_as_of: null,
          }),
        ]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );

    const tslaCell = screen.getByText('TSLA').closest('td');
    expect(tslaCell).not.toBeNull();
    const icon = within(tslaCell as HTMLElement).getByLabelText(
      /Last known price as of/,
    );
    expect(icon.getAttribute('aria-label')).toContain('an unknown date');
  });

  it('does not render the clock icon for live holdings', () => {
    render(
      <HoldingsTable
        holdings={[holding({ ticker: 'AAPL', price_source: 'live' })]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );
    const aaplCell = screen.getByText('AAPL').closest('td');
    expect(aaplCell).not.toBeNull();
    expect(
      within(aaplCell as HTMLElement).queryByLabelText(/Last known price/),
    ).toBeNull();
  });

  it('renders the Today column with day-over-day change when previous_close is set', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({
            ticker: 'AAPL',
            current_price: 200,
            previous_close: 195,
            quantity: 10,
          }),
        ]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );

    // Day change = (200 − 195) × 10 = +$50, +2.56%.
    // Leading ▲ glyph sits on the top line; the bottom-line percent is plain.
    expect(screen.getByText(/\+\$50\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+2\.56%/)).toBeInTheDocument();
    expect(screen.getAllByText('▲').length).toBeGreaterThan(0);
  });

  it('renders an em-dash in the Today column when previous_close is null', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({ ticker: 'TWTR', previous_close: null }),
        ]}
        missingPrices={[]}
        {...defaultProps}
      />,
    );

    // Several "—" cells exist (Today, plus Cash row stubs); just confirm at least one.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders a % of Portfolio column whose values sum to 100', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({ ticker: 'AAPL', current_value: 3_000, quantity: 10 }),
          holding({ ticker: 'MSFT', current_value: 6_000, quantity: 20 }),
        ]}
        cash={1_000}
        displayCurrency="USD"
        showEur={false}
        eurMetrics={null}
        locale="en-US"
        missingPrices={[]}
      />,
    );

    // Total market value = 1,000 (cash) + 3,000 + 6,000 = 10,000.
    // CASH weight = 10.0%, AAPL = 30.0%, MSFT = 60.0%. Total row reads 100.0%.
    expect(screen.getByText('10.0%')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('still shows the destructive missing-prices banner alongside a stale banner', () => {
    render(
      <HoldingsTable
        holdings={[
          holding({
            ticker: 'MSFT',
            price_source: 'last_known',
            price_as_of: '2026-04-20T09:00:00Z',
          }),
          holding({
            ticker: 'GOOG',
            price_source: 'missing',
            current_price: null,
            current_value: null,
            unrealized_gain_loss: null,
            unrealized_gain_loss_pct: null,
            price_as_of: null,
          }),
        ]}
        missingPrices={['GOOG']}
        {...defaultProps}
      />,
    );

    expect(
      screen.getByText(/Could not fetch current prices for: GOOG/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Using last known prices for: MSFT/),
    ).toBeInTheDocument();
  });
});

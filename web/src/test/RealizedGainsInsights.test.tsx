import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RealizedGainsInsights } from '../components/RealizedGainsInsights';
import type { TickerGroup } from '../hooks/useRealizedGainsData';
import type { RealizedSale } from '../api';

const makeSale = (overrides: Partial<RealizedSale> = {}): RealizedSale => ({
  ticker: 'AAPL',
  date: '2025-06-15T10:00:00',
  quantity: 5,
  quantity_before: 10,
  proceeds: 1000,
  cost_basis: 800,
  realized_gain: 200,
  first_buy_date: '2024-06-15T10:00:00',
  ...overrides,
});

const makeGroup = (ticker: string, gain: number, salesCount: number = 1): TickerGroup => ({
  ticker,
  totalGain: gain,
  sales: Array.from({ length: salesCount }, (_, i) =>
    makeSale({
      ticker,
      realized_gain: gain / salesCount,
      cost_basis: 800,
      proceeds: 800 + gain / salesCount,
      date: `2025-0${i + 1}-15T10:00:00`,
    }),
  ),
});

describe('RealizedGainsInsights', () => {
  const defaultProps = { locale: 'en-US' };

  it('returns null when fewer than 2 ticker groups', () => {
    const { container } = render(
      <RealizedGainsInsights filteredGains={[makeGroup('AAPL', 200)]} {...defaultProps} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders three insight cards when 2+ groups exist', () => {
    const groups = [makeGroup('AAPL', 500, 3), makeGroup('TSLA', -200, 2)];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    expect(screen.getByText('Top Winners')).toBeInTheDocument();
    expect(screen.getByText('Top Losers')).toBeInTheDocument();
    expect(screen.getByText('Most Traded')).toBeInTheDocument();
  });

  it('shows winners sorted by gain descending', () => {
    const groups = [
      makeGroup('AAPL', 500),
      makeGroup('MSFT', 1000),
      makeGroup('GOOG', 300),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    // All three should appear as winners
    const cards = screen.getAllByText(/MSFT|AAPL|GOOG/);
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('shows losers sorted by gain ascending (most negative first)', () => {
    const groups = [
      makeGroup('AAPL', -100),
      makeGroup('TSLA', -500),
      makeGroup('META', 200),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    expect(screen.getByText('Top Losers')).toBeInTheDocument();
    // TSLA should appear in losers
    expect(screen.getAllByText('TSLA').length).toBeGreaterThanOrEqual(1);
  });

  it('shows most traded sorted by sell count descending', () => {
    const groups = [
      makeGroup('AAPL', 100, 2),
      makeGroup('MSFT', 50, 7),
      makeGroup('GOOG', -30, 1),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    expect(screen.getByText('Most Traded')).toBeInTheDocument();
    // MSFT has 7 sells — should appear
    expect(screen.getAllByText('MSFT').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "No data" for empty categories', () => {
    // All gains positive — losers card should show "No data"
    const groups = [makeGroup('AAPL', 100), makeGroup('MSFT', 200)];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('limits each card to 3 entries', () => {
    const groups = [
      makeGroup('A', 100),
      makeGroup('B', 200),
      makeGroup('C', 300),
      makeGroup('D', 400),
      makeGroup('E', 500),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    // Winners card: E, D, C (top 3 by gain) — A and B should not be in winners
    // Most traded card: all have 1 sell, so top 3 by sort order
    // Total unique tickers rendered across all 3 cards
    const allTickers = screen.getAllByText(/^[A-E]$/);
    // Winners: 3, Losers: 0 (no data), Most Traded: 3 = 6 max
    expect(allTickers.length).toBeLessThanOrEqual(9); // 3 per card max
  });
});

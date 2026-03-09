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
  sales: Array.from({ length: salesCount }, (_, i) => {
    const month = String(i + 1).padStart(2, '0');
    return makeSale({
      ticker,
      realized_gain: gain / salesCount,
      cost_basis: 800,
      proceeds: 800 + gain / salesCount,
      date: `2025-${month}-15T10:00:00`,
    });
  }),
});

describe('RealizedGainsInsights', () => {
  const defaultProps = { locale: 'en-US' };

  it('returns null when fewer than 2 ticker groups', () => {
    const { container } = render(
      <RealizedGainsInsights filteredGains={[makeGroup('AAPL', 200)]} {...defaultProps} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders four insight cards when 2+ groups exist', () => {
    const groups = [makeGroup('AAPL', 500, 3), makeGroup('TSLA', -200, 2)];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    expect(screen.getByText('Top Winners')).toBeInTheDocument();
    expect(screen.getByText('Top Losers')).toBeInTheDocument();
    expect(screen.getByText('Most Traded')).toBeInTheDocument();
    expect(screen.getByText('Longest Held')).toBeInTheDocument();
  });

  it('shows winners sorted by gain descending', () => {
    const groups = [
      makeGroup('AAPL', 500),
      makeGroup('MSFT', 1000),
      makeGroup('GOOG', 300),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    // Grab the Winners card by its heading, then check order of tickers within it
    const winnersHeading = screen.getByText('Top Winners');
    const winnersCard = winnersHeading.closest('[data-slot="card"]')!;
    // Each InsightItem has a left flex-col whose first child is the ticker name
    const tickers = Array.from(winnersCard.querySelectorAll('.flex.flex-col > .text-sm.font-medium:not(.tabular-nums)'))
      .map((el) => el.textContent);
    expect(tickers).toEqual(['MSFT', 'AAPL', 'GOOG']);
  });

  it('shows losers sorted by gain ascending (most negative first)', () => {
    const groups = [
      makeGroup('AAPL', -100),
      makeGroup('TSLA', -500),
      makeGroup('META', 200),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    const losersHeading = screen.getByText('Top Losers');
    const losersCard = losersHeading.closest('[data-slot="card"]')!;
    const tickers = Array.from(losersCard.querySelectorAll('.flex.flex-col > .text-sm.font-medium:not(.tabular-nums)'))
      .map((el) => el.textContent);
    expect(tickers).toEqual(['TSLA', 'AAPL']);
  });

  it('shows most traded sorted by sell count descending', () => {
    const groups = [
      makeGroup('AAPL', 100, 2),
      makeGroup('MSFT', 50, 7),
      makeGroup('GOOG', -30, 1),
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    const tradedHeading = screen.getByText('Most Traded');
    const tradedCard = tradedHeading.closest('[data-slot="card"]')!;
    const tickers = Array.from(tradedCard.querySelectorAll('.flex.flex-col > .text-sm.font-medium:not(.tabular-nums)'))
      .map((el) => el.textContent);
    expect(tickers).toEqual(['MSFT', 'AAPL', 'GOOG']);
  });

  it('shows longest held sorted by max hold duration descending', () => {
    const groups: TickerGroup[] = [
      {
        ticker: 'AAPL',
        totalGain: 100,
        sales: [makeSale({ ticker: 'AAPL', date: '2025-06-15T10:00:00', first_buy_date: '2025-05-15T10:00:00' })], // ~31 days
      },
      {
        ticker: 'MSFT',
        totalGain: 200,
        sales: [makeSale({ ticker: 'MSFT', date: '2025-06-15T10:00:00', first_buy_date: '2023-06-15T10:00:00' })], // ~730 days
      },
      {
        ticker: 'GOOG',
        totalGain: 50,
        sales: [makeSale({ ticker: 'GOOG', date: '2025-06-15T10:00:00', first_buy_date: '2024-06-15T10:00:00' })], // ~365 days
      },
    ];
    render(<RealizedGainsInsights filteredGains={groups} {...defaultProps} />);

    const heading = screen.getByText('Longest Held');
    const card = heading.closest('[data-slot="card"]')!;
    const tickers = Array.from(card.querySelectorAll('.flex.flex-col > .text-sm.font-medium:not(.tabular-nums)'))
      .map((el) => el.textContent);
    expect(tickers).toEqual(['MSFT', 'GOOG', 'AAPL']);
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

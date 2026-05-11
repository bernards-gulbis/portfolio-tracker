import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { HeroPortfolioCard } from '../components/portfolio-status/HeroPortfolioCard';

const baseProps = {
  displayCurrency: 'EUR' as const,
  locale: 'en-US',
  netInvested: 89_591.62,
  totalReturn: 264_468.25,
  annualizedReturn: 21.14,
  vsSpPts: 12.4,
  afterTaxValue: 287_205.95,
  estimatedTax: 66_853.93,
  taxRate: 0.255,
  fxImpact: null,
  fxImpactPct: null,
};

describe('HeroPortfolioCard', () => {
  it('renders the portfolio value as the dominant figure', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={null}
      />,
    );
    expect(screen.getByText(/€354,059\.87/)).toBeInTheDocument();
    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
  });

  it('renders the "today" line when day change is available', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={{ usd: 11_425.64, pct: 3.33, partial: false }}
      />,
    );
    // Composed line: signed currency + signed percent + "today"
    expect(screen.getByText(/\+€11,425\.64/)).toBeInTheDocument();
    expect(screen.getByText(/▲3\.33%/)).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
  });

  it('shows an asterisk on the today line when day change is partial', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={{ usd: 10, pct: 0.1, partial: true }}
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders the four KPI tiles with their labels', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={null}
      />,
    );
    expect(screen.getByText('Net Invested')).toBeInTheDocument();
    expect(screen.getByText('Total Return')).toBeInTheDocument();
    expect(screen.getByText('vs S&P 500')).toBeInTheDocument();
    expect(screen.getByText('After-tax Value')).toBeInTheDocument();
  });

  it('renders vs-S&P value with sign and labels "Outperform" when positive', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={null}
        vsSpPts={12.4}
      />,
    );
    expect(screen.getByText(/\+12\.40 pts/)).toBeInTheDocument();
    expect(screen.getByText('Outperform')).toBeInTheDocument();
  });

  it('labels vs-S&P as "Underperform" when negative', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={null}
        vsSpPts={-3.2}
      />,
    );
    expect(screen.getByText('Underperform')).toBeInTheDocument();
  });

  it('renders em-dash for vs-S&P when the spread is unavailable', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={354_059.87}
        dayChange={null}
        vsSpPts={null}
      />,
    );
    // The tile-value is "—" — multiple em-dashes may be present (after-tax etc.).
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders em-dash for the main value when portfolioValue is null', () => {
    render(
      <HeroPortfolioCard
        {...baseProps}
        portfolioValue={null}
        dayChange={null}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarningsAlert } from '../components/portfolio-status/WarningsAlert';
import type { TransactionWarning } from '../api';

describe('WarningsAlert', () => {
  it('renders nothing when warnings array is empty', () => {
    const { container } = render(<WarningsAlert warnings={[]} locale="en-US" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the warnings heading when warnings are present', () => {
    const warnings: TransactionWarning[] = [
      { code: 'sellNotInHoldings', date: '2024-01-02T10:00:00', params: { ticker: 'XYZ' } },
    ];
    render(<WarningsAlert warnings={warnings} locale="en-US" />);
    expect(screen.getByText('Transaction warnings')).toBeInTheDocument();
  });

  it('renders a warning message for each entry', () => {
    const warnings: TransactionWarning[] = [
      { code: 'sellNotInHoldings', date: '2024-01-02T10:00:00', params: { ticker: 'AAPL' } },
      { code: 'withdrawNegativeCash', date: '2024-01-03T12:00:00', params: { amount: '500', balance: '-200' } },
    ];
    render(<WarningsAlert warnings={warnings} locale="en-US" />);

    expect(screen.getByText(/Cannot sell AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/negative cash balance/i)).toBeInTheDocument();
  });

  it('coerces string count parameter to a number for i18next pluralisation', () => {
    // fxRateMissingTicker uses count for singular/plural; params may arrive as string from JSON
    const warnings: TransactionWarning[] = [
      {
        code: 'fxRateMissingTicker',
        date: '2024-01-02T00:00:00',
        params: { ticker: 'AAPL', count: '1' },
      },
    ];
    // Should not throw and should render the translated warning
    expect(() => render(<WarningsAlert warnings={warnings} locale="en-US" />)).not.toThrow();
    expect(screen.getByText('Transaction warnings')).toBeInTheDocument();
  });

  it('handles non-numeric count string without throwing', () => {
    const warnings: TransactionWarning[] = [
      {
        code: 'fxRateMissingTicker',
        date: '2024-01-02T00:00:00',
        params: { ticker: 'ZZZ', count: 'not-a-number' },
      },
    ];
    expect(() => render(<WarningsAlert warnings={warnings} locale="en-US" />)).not.toThrow();
    expect(screen.getByText(/ZZZ transaction/)).toBeInTheDocument();
  });

  it('renders multiple warnings with the same code and date without key collision', () => {
    const warnings: TransactionWarning[] = [
      { code: 'fxRateMissingTicker', date: '2024-01-02T00:00:00', params: { ticker: 'AAPL' } },
      { code: 'fxRateMissingTicker', date: '2024-01-02T00:00:00', params: { ticker: 'MSFT' } },
    ];
    render(<WarningsAlert warnings={warnings} locale="en-US" />);
    expect(screen.getByText(/AAPL transaction/)).toBeInTheDocument();
    expect(screen.getByText(/MSFT transaction/)).toBeInTheDocument();
  });
});

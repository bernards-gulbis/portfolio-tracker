import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HistorySection } from '../components/portfolio-status/HistorySection';
import type { DividendReceived, RealizedSale, WithdrawalFx } from '../api';

beforeEach(() => {
  localStorage.removeItem('pt_gains_view_mode');
  localStorage.removeItem('pt_dividends_view_mode');
});

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

const makeDividend = (overrides: Partial<DividendReceived> = {}): DividendReceived => ({
  ticker: 'MSFT',
  date: '2025-06-15T10:00:00',
  amount: 25,
  amount_eur: 23,
  ...overrides,
});

const makeWithdrawal = (overrides: Partial<WithdrawalFx> = {}): WithdrawalFx => ({
  date: '2025-06-15T10:00:00',
  amount: 1500,
  amount_eur_avg: 1380,
  amount_eur: 1400,
  realized_fx_gain: 20,
  ...overrides,
});

const defaultProps = {
  displayCurrency: 'USD' as const,
  locale: 'en-US',
  principalEur: 5000,
  dividendsEur: 100,
  taxRate: 0.25,
};

describe('HistorySection', () => {
  it('renders all three tab triggers with count badges', () => {
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[makeSale(), makeSale({ ticker: 'MSFT' })]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[makeWithdrawal(), makeWithdrawal(), makeWithdrawal()]}
      />,
    );

    const realizedTab = screen.getByRole('tab', { name: /realized gains/i });
    const dividendsTab = screen.getByRole('tab', { name: /^dividends/i });
    const withdrawalsTab = screen.getByRole('tab', { name: /withdrawals/i });

    expect(within(realizedTab).getByText('2')).toBeInTheDocument();
    expect(within(dividendsTab).getByText('1')).toBeInTheDocument();
    expect(within(withdrawalsTab).getByText('3')).toBeInTheDocument();
  });

  it('defaults to the Realized Gains tab', () => {
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[makeSale()]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[makeWithdrawal()]}
      />,
    );

    const realizedTab = screen.getByRole('tab', { name: /realized gains/i });
    expect(realizedTab).toHaveAttribute('data-state', 'active');
  });

  it('switches the active tab when a different trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[makeSale()]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[makeWithdrawal()]}
      />,
    );

    const dividendsTab = screen.getByRole('tab', { name: /^dividends/i });
    await user.click(dividendsTab);
    expect(dividendsTab).toHaveAttribute('data-state', 'active');

    const withdrawalsTab = screen.getByRole('tab', { name: /withdrawals/i });
    await user.click(withdrawalsTab);
    expect(withdrawalsTab).toHaveAttribute('data-state', 'active');
  });

  it('shows the empty-state placeholder when a category has no data', () => {
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[makeWithdrawal()]}
      />,
    );

    expect(screen.getByText('No realized gains yet')).toBeInTheDocument();
    const realizedTab = screen.getByRole('tab', { name: /realized gains/i });
    expect(within(realizedTab).getByText('0')).toBeInTheDocument();
  });

  it('mounts all three tab panels so per-tab state survives switching', () => {
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[makeSale()]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[makeWithdrawal()]}
      />,
    );

    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(3);
    const activeCount = panels.filter((p) => p.getAttribute('data-state') === 'active').length;
    const inactiveCount = panels.filter(
      (p) => p.getAttribute('data-state') === 'inactive',
    ).length;
    expect(activeCount).toBe(1);
    expect(inactiveCount).toBe(2);
  });

  it('preserves a table filter when switching tabs and back', async () => {
    const user = userEvent.setup();
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[
          makeSale({ ticker: 'AAPL' }),
          makeSale({ ticker: 'MSFT' }),
        ]}
        dividendsReceived={[makeDividend()]}
        realizedWithdrawals={[]}
      />,
    );

    const tickerInput = screen.getAllByPlaceholderText(/asset/i)[0] as HTMLInputElement;
    await user.type(tickerInput, 'AAPL');
    expect(tickerInput.value).toBe('AAPL');

    await user.click(screen.getByRole('tab', { name: /^dividends/i }));
    await user.click(screen.getByRole('tab', { name: /realized gains/i }));

    const tickerInputAfter = screen.getAllByPlaceholderText(/asset/i)[0] as HTMLInputElement;
    expect(tickerInputAfter.value).toBe('AAPL');
  });

  it('shows a joined summary with only non-zero count segments in the collapsed header', () => {
    render(
      <HistorySection
        {...defaultProps}
        realizedSales={[makeSale(), makeSale()]}
        dividendsReceived={[]}
        realizedWithdrawals={[makeWithdrawal()]}
      />,
    );

    expect(screen.getByText('2 sales · 1 withdrawal')).toBeInTheDocument();
  });
});

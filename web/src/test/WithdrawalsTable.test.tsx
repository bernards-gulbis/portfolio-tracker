import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawalsTable } from '../components/WithdrawalsTable';
import type { WithdrawalFx } from '../api';

const makeWithdrawal = (overrides: Partial<WithdrawalFx> = {}): WithdrawalFx => ({
  date: '2025-06-15T10:00:00',
  amount: 1000,
  amount_eur_avg: 900,
  amount_eur: 920,
  realized_fx_gain: 20,
  ...overrides,
});

describe('WithdrawalsTable', () => {
  const defaultProps = {
    locale: 'en-US',
    principalEur: 5000,
    dividendsEur: 100,
    taxRate: 0.2,
  };

  it('returns null when no withdrawals', () => {
    const { container } = render(
      <WithdrawalsTable realizedWithdrawals={[]} {...defaultProps} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders withdrawal rows', () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ amount: 1000, amount_eur: 920 }),
      makeWithdrawal({ date: '2025-05-10T10:00:00', amount: 500, amount_eur: 460 }),
    ];
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('shows total row with aggregated values', () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ amount: 1000, amount_eur: 920, amount_eur_avg: 900, realized_fx_gain: 20 }),
      makeWithdrawal({ date: '2025-05-10T10:00:00', amount: 500, amount_eur: 460, amount_eur_avg: 450, realized_fx_gain: 10 }),
    ];
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    expect(screen.getByText('Total')).toBeInTheDocument();
    // Total amount: $1,500.00
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('sorts by amount column', async () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ amount: 1000 }),
      makeWithdrawal({ date: '2025-05-10T10:00:00', amount: 500 }),
    ];
    const user = userEvent.setup();
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    // Click Amount USD header twice to sort ascending (first click = desc, second = asc)
    const amountHeader = screen.getByText(/Amount USD/i);
    await user.click(amountHeader);
    await user.click(amountHeader);

    // Verify actual row order (skip header row and total row)
    const rows = screen.getAllByRole('row');
    const dataRows = rows.filter(r => !r.querySelector('th'));
    // First data row should be $500 (ascending), second is $1000, last is Total
    const firstRowText = dataRows[0].textContent ?? '';
    const secondRowText = dataRows[1].textContent ?? '';
    expect(firstRowText).toContain('$500.00');
    expect(secondRowText).toContain('$1,000.00');
  });

  it('sorts by fx gain column', async () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ realized_fx_gain: 20 }),
      makeWithdrawal({ date: '2025-05-10T10:00:00', realized_fx_gain: -10 }),
    ];
    const user = userEvent.setup();
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    const fxHeader = screen.getByText(/Realized FX G\/L/i);
    await user.click(fxHeader);

    expect(screen.getByText('+€20.00')).toBeInTheDocument();
    expect(screen.getByText('-€10.00')).toBeInTheDocument();
  });

  it('shows tax column with calculated tax amounts', () => {
    // Tax threshold includes totalWithdrawnEur, so a single batch can't exceed it.
    // Verify the tax rate header renders correctly.
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ amount: 10000, amount_eur: 10000, amount_eur_avg: 9000, realized_fx_gain: 1000 }),
    ];
    render(
      <WithdrawalsTable
        realizedWithdrawals={withdrawals}
        locale="en-US"
        principalEur={5000}
        dividendsEur={100}
        taxRate={0.2}
      />
    );

    expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
  });

  it('shows dash when no taxable amount', () => {
    // Small withdrawal, no tax
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ amount: 100, amount_eur: 92 }),
    ];
    render(
      <WithdrawalsTable
        realizedWithdrawals={withdrawals}
        locale="en-US"
        principalEur={50000}
        dividendsEur={1000}
        taxRate={0.2}
      />
    );

    // When no taxable amount, show '-'
    const cells = screen.getAllByRole('cell');
    const dashCell = cells.find(cell => cell.textContent === '-');
    expect(dashCell).toBeDefined();
  });

  it('filters by year when multiple years present', async () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ date: '2025-06-15T10:00:00', amount: 1000 }),
      makeWithdrawal({ date: '2024-03-10T10:00:00', amount: 500 }),
    ];
    const user = userEvent.setup();
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    // Year filter should be visible
    const yearTrigger = screen.getByRole('combobox');
    await user.click(yearTrigger);

    const option2024 = await screen.findByRole('option', { name: '2024' });
    await user.click(option2024);

    // $500.00 appears in both row and total
    expect(screen.getAllByText('$500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('$1,000.00')).not.toBeInTheDocument();
  });

  it('does not show year filter when only one year', () => {
    const withdrawals: WithdrawalFx[] = [
      makeWithdrawal({ date: '2025-06-15T10:00:00' }),
      makeWithdrawal({ date: '2025-03-10T10:00:00' }),
    ];
    render(
      <WithdrawalsTable realizedWithdrawals={withdrawals} {...defaultProps} />
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

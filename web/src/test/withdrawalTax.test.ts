import { describe, it, expect } from 'vitest';
import { computeWithdrawalTaxMap } from '../utils/eurMetrics';
import type { WithdrawalFx } from '../api';

const makeWithdrawal = (date: string, amountEur: number): WithdrawalFx => ({
  date,
  amount: amountEur * 1.1, // USD amount (irrelevant for taxable calc)
  amount_eur: amountEur,
  amount_eur_avg: amountEur,
  realized_fx_gain: 0,
});

describe('computeWithdrawalTaxMap', () => {
  it('no taxable amount when withdrawals are below threshold', () => {
    // Deposited €9,000, dividends €200 → threshold = €9,200
    // Single withdrawal €5,000 → taxable = 0
    const withdrawals = [makeWithdrawal('2025-06-01', 5000)];
    // principal_eur = deposits_eur - withdrawals_eur = (principalEur + totalWithdrawn) - totalWithdrawn
    // If principal_eur = 4000, totalWithdrawn = 5000 → totalDeposited = 9000
    const map = computeWithdrawalTaxMap(withdrawals, 4000, 200);
    expect(map.get(0)).toBe(0);
  });

  it('computes taxable amounts across multiple withdrawals (plan example)', () => {
    // Deposited €9,000, dividends €200 → threshold = €9,200
    // principal_eur = 9000 - (5000+3000+2000) = -1000
    // But we reconstruct: principalEur + totalWithdrawn = -1000 + 10000 = 9000 ✓
    const withdrawals = [
      makeWithdrawal('2025-01-15', 5000),
      makeWithdrawal('2025-03-20', 3000),
      makeWithdrawal('2025-06-01', 2000),
    ];
    const principalEur = -1000; // after all withdrawals: 9000 deposited - 10000 withdrawn
    const map = computeWithdrawalTaxMap(withdrawals, principalEur, 200);

    expect(map.get(0)).toBe(0);    // W1: cumulative €5,000 < €9,200
    expect(map.get(1)).toBe(0);    // W2: cumulative €8,000 < €9,200
    expect(map.get(2)).toBe(800);  // W3: cumulative €10,000 - €9,200 = €800
  });

  it('returns empty map when dividendsEur is null (FX rate unknown)', () => {
    // When dividendsEur is null the EUR dividend income is unknown; substituting 0
    // would silently overstate the taxable threshold, so the function returns an
    // empty Map so the UI can show "—" rather than a misleading number.
    const withdrawals = [makeWithdrawal('2025-01-01', 6000)];
    const principalEur = -1000; // 5000 - 6000
    const map = computeWithdrawalTaxMap(withdrawals, principalEur, null);
    expect(map.size).toBe(0);
  });

  it('processes in chronological order regardless of input order', () => {
    // Same scenario but withdrawals in reverse order in the array
    const withdrawals = [
      makeWithdrawal('2025-06-01', 2000), // idx 0 — chronologically last
      makeWithdrawal('2025-03-20', 3000), // idx 1
      makeWithdrawal('2025-01-15', 5000), // idx 2 — chronologically first
    ];
    const principalEur = -1000;
    const map = computeWithdrawalTaxMap(withdrawals, principalEur, 200);

    // Chronological processing: 5000, 3000, 2000
    // After 5000: cum=5000, taxable=0
    // After 3000: cum=8000, taxable=0
    // After 2000: cum=10000, taxable=800
    expect(map.get(2)).toBe(0);    // idx 2 = first chronologically (€5,000)
    expect(map.get(1)).toBe(0);    // idx 1 = second (€3,000)
    expect(map.get(0)).toBe(800);  // idx 0 = third (€2,000), gets the taxable portion
  });

  it('returns empty map for no withdrawals', () => {
    const map = computeWithdrawalTaxMap([], 5000, 200);
    expect(map.size).toBe(0);
  });

  it('all withdrawals taxable when threshold is zero', () => {
    // principal_eur = -3000, totalWithdrawn = 3000 → deposited = 0, dividends = 0
    const withdrawals = [
      makeWithdrawal('2025-01-01', 1000),
      makeWithdrawal('2025-02-01', 2000),
    ];
    const map = computeWithdrawalTaxMap(withdrawals, -3000, 0);
    expect(map.get(0)).toBe(1000);
    expect(map.get(1)).toBe(2000);
  });

  it('partial taxable on a single withdrawal that crosses threshold', () => {
    // Deposited €3,000, dividends €500 → threshold = €3,500
    // Withdrawal €5,000 → taxable = €1,500
    const withdrawals = [makeWithdrawal('2025-01-01', 5000)];
    const principalEur = -2000; // 3000 - 5000
    const map = computeWithdrawalTaxMap(withdrawals, principalEur, 500);
    expect(map.get(0)).toBe(1500);
  });
});

import { describe, expect, it } from 'vitest';

import { parseLocalDate } from '../components/transaction-form/helpers';

describe('parseLocalDate', () => {
  it('parses a valid YYYY-MM-DD string into a local-time Date', () => {
    const d = parseLocalDate('2025-06-15');
    expect(d).toBeDefined();
    // Local-time construction — no UTC shift regardless of timezone.
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5); // June
    expect(d!.getDate()).toBe(15);
  });

  it.each([
    '',
    '2025',
    '2025-06',
    '2025-6-15',
    '25-06-15',
    '2025/06/15',
    'abc',
    '  2025-06-15  ',
  ])('returns undefined for malformed input %s', (input) => {
    expect(parseLocalDate(input)).toBeUndefined();
  });

  // Regression guard: JS Date constructor silently normalizes
  // out-of-range day/month values (e.g. Feb 31 -> Mar 3). A round-trip
  // check inside parseLocalDate must reject these rather than accepting
  // a different valid date.
  it.each([
    ['2025-02-29', 'Feb 29 in non-leap year'],
    ['2025-02-31', 'Feb 31'],
    ['2025-04-31', 'Apr 31'],
    ['2025-13-01', 'month 13'],
    ['2025-00-15', 'month 0'],
    ['2025-06-00', 'day 0'],
    ['2025-06-32', 'day 32'],
  ])('rejects invalid calendar date %s (%s)', (input) => {
    expect(parseLocalDate(input)).toBeUndefined();
  });

  it('accepts Feb 29 in a leap year', () => {
    const d = parseLocalDate('2024-02-29');
    expect(d).toBeDefined();
    expect(d!.getMonth()).toBe(1);
    expect(d!.getDate()).toBe(29);
  });
});

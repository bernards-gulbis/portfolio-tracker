import { describe, it, expect } from 'vitest';
import { getHeaderValues } from '../components/performance-chart/headerInfo';
import type { ChartDataPoint } from '../components/performance-chart/types';

const point = (over: Partial<ChartDataPoint>): ChartDataPoint => ({
  date: '2026-05-01',
  principal: null,
  currentValue: null,
  returnPct: null,
  sp500ReturnPct: null,
  ...over,
});

describe('getHeaderValues — value mode', () => {
  it('uses money-weighted percent so the sign agrees with the absolute change even when TWR disagrees', () => {
    // Reproduces the bug from the screenshot: value drops €21,501 over the period
    // (cash outflow), but TWR is +0.99%. Header must reflect the headline (down).
    const first = point({ date: '2026-04-05', currentValue: 370957.06, returnPct: 0 });
    const last = point({ date: '2026-05-01', currentValue: 349455.74, returnPct: 0.99 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false);

    expect(result.mode).toBe('value');
    expect(result.isPositive).toBe(false);
    // Money-weighted: -21501.32 / 370957.06 ≈ -5.80%
    expect(result.mode === 'value' && result.pctDisplay).toBe('▼5.80%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('-€21,501.32');
  });

  it('agrees in sign for the normal positive case too', () => {
    const first = point({ currentValue: 100000, returnPct: 0 });
    const last = point({ currentValue: 110000, returnPct: 10 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false);

    expect(result.isPositive).toBe(true);
    expect(result.mode === 'value' && result.pctDisplay).toBe('▲10.00%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€10,000.00');
  });

  it('falls back to empty pctDisplay when base is zero (avoids divide by zero)', () => {
    const first = point({ currentValue: 0, returnPct: null });
    const last = point({ currentValue: 1000, returnPct: null });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false);

    expect(result.mode === 'value' && result.pctDisplay).toBe('');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€1,000.00');
  });

  it('uses principal as the base for the all-time period', () => {
    const first = point({ currentValue: 100000, principal: 50000 });
    const last = point({ currentValue: 75000, principal: 50000 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', true);

    // diff = 75000 - 50000 = +25000; pct = 25000/50000 = +50%
    expect(result.isPositive).toBe(true);
    expect(result.mode === 'value' && result.pctDisplay).toBe('▲50.00%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€25,000.00');
  });
});

describe('getHeaderValues — pct mode', () => {
  it('still uses TWR (rebased return_pct) so benchmark comparison is preserved', () => {
    const first = point({ currentValue: 370957.06, returnPct: 0, sp500ReturnPct: 0 });
    const last = point({ currentValue: 349455.74, returnPct: 0.99, sp500ReturnPct: 1.5 });

    const result = getHeaderValues(last, first, 'pct', 'EUR', 'en-US', false);

    expect(result.mode).toBe('pct');
    expect(result.isPositive).toBe(true);
    expect(result.mode === 'pct' && result.displayValue).toBe('+0.99%');
    expect(result.mode === 'pct' && result.sp500Display).toBe('+1.50%');
  });
});

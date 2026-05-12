import { describe, it, expect } from 'vitest';
import { getHeaderValues, parseYMD } from '../components/performance-chart/headerInfo';
import type { ChartDataPoint } from '../components/performance-chart/types';

const point = (over: Partial<ChartDataPoint>): ChartDataPoint => ({
  date: '2026-05-01',
  principal: null,
  currentValue: null,
  returnPct: null,
  sp500ReturnPct: null,
  sp500Value: null,
  ...over,
});

const PP = 'pp';

describe('getHeaderValues — value mode', () => {
  it('uses money-weighted percent so the sign agrees with the absolute change even when TWR disagrees', () => {
    // Reproduces the bug from the screenshot: value drops €21,501 over the period
    // (cash outflow), but TWR is +0.99%. Header must reflect the headline (down).
    const first = point({ date: '2026-04-05', currentValue: 370957.06, returnPct: 0 });
    const last = point({ date: '2026-05-01', currentValue: 349455.74, returnPct: 0.99 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('value');
    expect(result.isPositive).toBe(false);
    // Money-weighted: -21501.32 / 370957.06 ≈ -5.80%
    expect(result.mode === 'value' && result.pctDisplay).toBe('▼5.80%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('-€21,501.32');
  });

  it('agrees in sign for the normal positive case too', () => {
    const first = point({ currentValue: 100000, returnPct: 0 });
    const last = point({ currentValue: 110000, returnPct: 10 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.isPositive).toBe(true);
    expect(result.mode === 'value' && result.pctDisplay).toBe('▲10.00%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€10,000.00');
  });

  it('falls back to empty pctDisplay when base is zero (avoids divide by zero)', () => {
    const first = point({ currentValue: 0, returnPct: null });
    const last = point({ currentValue: 1000, returnPct: null });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.mode === 'value' && result.pctDisplay).toBe('');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€1,000.00');
  });

  it('uses principal as the base for the all-time period', () => {
    const first = point({ currentValue: 100000, principal: 50000 });
    const last = point({ currentValue: 75000, principal: 50000 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', true, PP);

    // diff = 75000 - 50000 = +25000; pct = 25000/50000 = +50%
    expect(result.isPositive).toBe(true);
    expect(result.mode === 'value' && result.pctDisplay).toBe('▲50.00%');
    expect(result.mode === 'value' && result.changeDisplay).toBe('+€25,000.00');
  });

  it('produces a vs-S&P spread when both rebased returns are available', () => {
    const first = point({ currentValue: 100000, returnPct: 0, sp500ReturnPct: 0 });
    const last = point({ currentValue: 110000, returnPct: 10, sp500ReturnPct: 6 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.spreadDisplay).toBe('+4.00 pp');
  });

  it('omits the spread when either side is null', () => {
    const first = point({ currentValue: 100000, returnPct: 0, sp500ReturnPct: null });
    const last = point({ currentValue: 110000, returnPct: 10, sp500ReturnPct: null });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.spreadDisplay).toBeNull();
  });
});

describe('getHeaderValues — pct mode', () => {
  it('returns rebased returnPct as displayValue and computes spread', () => {
    const first = point({ currentValue: 370957.06, returnPct: 0, sp500ReturnPct: 0 });
    const last = point({ currentValue: 349455.74, returnPct: 0.99, sp500ReturnPct: 1.5 });

    const result = getHeaderValues(last, first, 'pct', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('pct');
    expect(result.isPositive).toBe(true);
    expect(result.mode === 'pct' && result.displayValue).toBe('+0.99%');
    // 0.99 − 1.50 = −0.51 pp
    expect(result.spreadDisplay).toBe('−0.51 pp');
  });

  it('returns displayValue "-" and null spreadDisplay when returnPct is null', () => {
    const first = point({ currentValue: 100000, returnPct: null, sp500ReturnPct: null });
    const last = point({ currentValue: 110000, returnPct: null, sp500ReturnPct: null });

    const result = getHeaderValues(last, first, 'pct', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('pct');
    expect(result.displayValue).toBe('-');
    expect(result.spreadDisplay).toBeNull();
    expect(result.isPositive).toBe(true);
  });

  it('omits the spread when sp500ReturnPct is null but returnPct is set', () => {
    const first = point({ currentValue: 100000, returnPct: 0, sp500ReturnPct: null });
    const last = point({ currentValue: 110000, returnPct: 5, sp500ReturnPct: null });

    const result = getHeaderValues(last, first, 'pct', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('pct');
    expect(result.spreadDisplay).toBeNull();
    expect(result.displayValue).toBe('+5.00%');
  });
});

describe('getHeaderValues — value mode null currentValue', () => {
  it('returns EMPTY_VALUE_HEADER when currentValue is null', () => {
    const first = point({ currentValue: 100000 });
    const last = point({ currentValue: null });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('value');
    expect(result.displayValue).toBe('-');
    expect(result.mode === 'value' && result.changeDisplay).toBeNull();
  });

  it('returns partial header when currentValue is set but base is null (first.currentValue null)', () => {
    const first = point({ currentValue: null });
    const last = point({ currentValue: 50000, principal: 40000 });

    const result = getHeaderValues(last, first, 'value', 'EUR', 'en-US', false, PP);

    expect(result.mode).toBe('value');
    // Has a displayValue but no changeDisplay since base is null
    expect(result.displayValue).toBe('€50,000.00');
    expect(result.mode === 'value' && result.changeDisplay).toBeNull();
  });
});

describe('parseYMD', () => {
  it('parses YYYY-MM-DD as a local date', () => {
    const date = parseYMD('2026-03-15');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // March = 2
    expect(date.getDate()).toBe(15);
  });

  it('avoids UTC shift: day component matches the string', () => {
    // In UTC-N timezones, new Date('2026-01-01') shifts to Dec 31
    const date = parseYMD('2026-01-01');
    expect(date.getDate()).toBe(1);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getFullYear()).toBe(2026);
  });
});

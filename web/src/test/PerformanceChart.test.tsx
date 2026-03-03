import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PerformanceChart } from '../components/PerformanceChart';
import { computeBaseFactor, rebasePct } from '../utils/performanceCalc';
import type { PerformanceDataPoint } from '../api';

// Format a Date as YYYY-MM-DD using local time (matches the fix in PerformanceChart)
const fmtDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Use recent dates so data falls within the default "1M" period filter
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const mockData: PerformanceDataPoint[] = [
  { date: fmtDate(yesterday), principal: 11765, principal_eur: 10824, current_value: 12353, fx_rate: 0.92, return_pct: 5.0, sp500_return_pct: 0 },
  { date: fmtDate(today), principal: 11765, principal_eur: 10824, current_value: 12706, fx_rate: 0.92, return_pct: 8.0, sp500_return_pct: 1.2 },
];

// Old data that will be filtered out by the default "1M" period
const oldMockData: PerformanceDataPoint[] = [
  { date: '2023-01-01', principal: 11765, principal_eur: 10589, current_value: 12353, fx_rate: 0.90, return_pct: 5.0, sp500_return_pct: 0 },
  { date: '2023-01-02', principal: 11765, principal_eur: 10589, current_value: 12706, fx_rate: 0.90, return_pct: 8.0, sp500_return_pct: 1.2 },
];

describe('PerformanceChart', () => {
  it('shows skeleton while loading', () => {
    render(<PerformanceChart data={[]} isLoading={true} />);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "No performance data available" when data is empty', () => {
    render(<PerformanceChart data={[]} isLoading={false} />);

    expect(screen.getByText('No performance data available')).toBeInTheDocument();
  });

  it('renders chart with header value when data is provided', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Performance')).toBeInTheDocument();
    // The header should show the latest current value in EUR (12706 * 0.92 = 11689.52)
    // formatted as currency — just verify Performance title is rendered
  });

  it('renders all period tab triggers', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByRole('tab', { name: '1M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '6M' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'YTD' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '1Y' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });

  it('renders view mode toggle (EUR / %)', () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    expect(screen.getByRole('tab', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '%' })).toBeInTheDocument();
  });

  it('does not render tabs when loading', () => {
    render(<PerformanceChart data={[]} isLoading={true} />);

    expect(screen.queryByRole('tab', { name: '1M' })).not.toBeInTheDocument();
  });

  it('switches period without error when tab is clicked', async () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    // Should not throw — period switching is client-side only
    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('data-state', 'active');
  });

  it('switches view mode when % tab is clicked', async () => {
    render(<PerformanceChart data={mockData} isLoading={false} />);

    await userEvent.click(screen.getByRole('tab', { name: '%' }));
    expect(screen.getByRole('tab', { name: '%' })).toHaveAttribute('data-state', 'active');
  });

  it('shows insufficient data message when filtered data has < 2 points', () => {
    render(<PerformanceChart data={oldMockData} isLoading={false} />);

    // Data exists (raw length >= 2) but after 1M filter, < 2 points remain
    expect(screen.getByText(/Not enough data points for this time period/)).toBeInTheDocument();
    // Period selector should still be visible so user can switch
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit tests for rebase math helpers
// ---------------------------------------------------------------------------

describe('computeBaseFactor', () => {
  const mkPoint = (return_pct: number | null, fx_rate: number | null = null, sp500_return_pct: number | null = null): PerformanceDataPoint => ({
    date: '2026-01-01',
    principal: 10000,
    principal_eur: null,
    current_value: 10000,
    fx_rate,
    return_pct,
    sp500_return_pct,
  });

  it('returns factor = 1 + pct/100 in USD mode', () => {
    const points = [mkPoint(10)];
    const result = computeBaseFactor(points, p => p.return_pct, false);
    expect(result).toBeCloseTo(1.1);
  });

  it('returns factor × fx_rate in EUR mode', () => {
    const points = [mkPoint(10, 0.92)];
    const result = computeBaseFactor(points, p => p.return_pct, true);
    // (1 + 10/100) * 0.92 = 1.012
    expect(result).toBeCloseTo(1.1 * 0.92);
  });

  it('skips points with null return_pct', () => {
    const points = [mkPoint(null, 0.92), mkPoint(5, 0.92)];
    const result = computeBaseFactor(points, p => p.return_pct, false);
    expect(result).toBeCloseTo(1.05);
  });

  it('skips points with null fx_rate in EUR mode', () => {
    const points = [mkPoint(5, null), mkPoint(10, 0.90)];
    const result = computeBaseFactor(points, p => p.return_pct, true);
    // First point skipped (no fx_rate), second: (1.10) * 0.90 = 0.99
    expect(result).toBeCloseTo(1.1 * 0.9);
  });

  it('returns null when all points have null return_pct', () => {
    const points = [mkPoint(null), mkPoint(null)];
    const result = computeBaseFactor(points, p => p.return_pct, false);
    expect(result).toBeNull();
  });

  it('works with 0% return (factor = 1)', () => {
    const points = [mkPoint(0, 0.92)];
    const result = computeBaseFactor(points, p => p.return_pct, true);
    expect(result).toBeCloseTo(0.92);
  });
});

describe('rebasePct', () => {
  it('rebases USD return relative to base', () => {
    // Point: 10% cumulative, base factor: 1.05 (from a 5% starting point)
    // (1.10 / 1.05 - 1) * 100 ≈ 4.7619%
    const result = rebasePct(10, null, 1.05, false);
    expect(result).toBeCloseTo((1.10 / 1.05 - 1) * 100, 4);
  });

  it('rebases to 0% when rawPct matches the base', () => {
    // If base was computed from a 5% point → baseFactor = 1.05
    // rawPct = 5% → factor = 1.05 → 1.05/1.05 - 1 = 0
    const result = rebasePct(5, null, 1.05, false);
    expect(result).toBeCloseTo(0);
  });

  it('applies FX adjustment in EUR mode', () => {
    // USD: 10% return, fx_rate now 0.88, base factor (from 0% @ 0.92) = 1.0 * 0.92 = 0.92
    // EUR factor = 1.10 * 0.88 = 0.968
    // rebased = (0.968 / 0.92 - 1) * 100 ≈ 5.2174%
    const result = rebasePct(10, 0.88, 0.92, true);
    expect(result).toBeCloseTo((1.10 * 0.88 / 0.92 - 1) * 100, 4);
  });

  it('returns null for null rawPct', () => {
    expect(rebasePct(null, 0.92, 1.0, false)).toBeNull();
  });

  it('returns null for null baseFactor', () => {
    expect(rebasePct(10, 0.92, null, false)).toBeNull();
  });

  it('returns null for zero baseFactor', () => {
    expect(rebasePct(10, 0.92, 0, false)).toBeNull();
  });

  it('handles negative returns correctly', () => {
    // -5% return, base factor 1.0 (USD)
    // (0.95 / 1.0 - 1) * 100 = -5
    const result = rebasePct(-5, null, 1.0, false);
    expect(result).toBeCloseTo(-5);
  });

  it('ignores fx_rate in USD mode even if provided', () => {
    const resultUsd = rebasePct(10, 0.88, 1.0, false);
    const resultNoFx = rebasePct(10, null, 1.0, false);
    expect(resultUsd).toBeCloseTo(resultNoFx!);
  });
});

// ---------------------------------------------------------------------------
// EUR mode end-to-end verification
// ---------------------------------------------------------------------------

describe('EUR mode FX-adjusted returns', () => {
  it('correctly computes EUR return with changing FX rate', () => {
    // Scenario from plan: Portfolio $10k→$11k (10% USD), fx 0.92→0.88
    // Expected EUR return: (1.10 * 0.88) / (1.0 * 0.92) - 1 = 5.217%
    const data: PerformanceDataPoint[] = [
      { date: '2026-01-01', principal: 10000, principal_eur: 9200, current_value: 10000, fx_rate: 0.92, return_pct: 0, sp500_return_pct: 0 },
      { date: '2026-01-15', principal: 10000, principal_eur: 9200, current_value: 11000, fx_rate: 0.88, return_pct: 10, sp500_return_pct: 5 },
    ];

    const baseFactor = computeBaseFactor(data, p => p.return_pct, true);
    expect(baseFactor).toBeCloseTo(1.0 * 0.92); // 0.92

    const eurReturn = rebasePct(10, 0.88, baseFactor, true);
    expect(eurReturn).toBeCloseTo(5.2174, 2);
  });

  it('EUR return equals USD return when FX rate is constant', () => {
    const data: PerformanceDataPoint[] = [
      { date: '2026-01-01', principal: 10000, principal_eur: 9200, current_value: 10000, fx_rate: 0.92, return_pct: 0, sp500_return_pct: 0 },
      { date: '2026-01-15', principal: 10000, principal_eur: 9200, current_value: 11000, fx_rate: 0.92, return_pct: 10, sp500_return_pct: 5 },
    ];

    const baseFactor = computeBaseFactor(data, p => p.return_pct, true);
    const eurReturn = rebasePct(10, 0.92, baseFactor, true);
    // With constant FX: (1.10 * 0.92) / (1.0 * 0.92) - 1 = 10%
    expect(eurReturn).toBeCloseTo(10, 4);
  });
});

// ---------------------------------------------------------------------------
// All-null return_pct data handling
// ---------------------------------------------------------------------------

describe('all-null return_pct handling', () => {
  it('computeBaseFactor returns null for all-null data', () => {
    const data: PerformanceDataPoint[] = [
      { date: '2026-01-01', principal: 10000, principal_eur: 9200, current_value: null, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
      { date: '2026-01-02', principal: 10000, principal_eur: 9200, current_value: null, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
    ];

    expect(computeBaseFactor(data, p => p.return_pct, false)).toBeNull();
    expect(computeBaseFactor(data, p => p.return_pct, true)).toBeNull();
  });

  it('rebasePct returns null when baseFactor is null', () => {
    expect(rebasePct(5, 0.92, null, true)).toBeNull();
  });

  it('renders chart without crash when all return_pct are null', () => {
    const nullReturnData: PerformanceDataPoint[] = [
      { date: fmtDate(yesterday), principal: 10000, principal_eur: 9200, current_value: 10000, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
      { date: fmtDate(today), principal: 10000, principal_eur: 9200, current_value: 10500, fx_rate: 0.92, return_pct: null, sp500_return_pct: null },
    ];

    // Should render without throwing
    render(<PerformanceChart data={nullReturnData} isLoading={false} />);
    expect(screen.getByText('Performance')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// fmtDate helper correctness (timezone-safe)
// ---------------------------------------------------------------------------

describe('fmtDate helper', () => {
  it('formats local midnight date without UTC shift', () => {
    // Midnight Jan 1 local time — toISOString() would shift backward in UTC+ zones
    const jan1 = new Date(2026, 0, 1); // Jan 1, 2026 local
    expect(fmtDate(jan1)).toBe('2026-01-01');
  });

  it('formats Dec 31 correctly', () => {
    const dec31 = new Date(2025, 11, 31);
    expect(fmtDate(dec31)).toBe('2025-12-31');
  });

  it('zero-pads single-digit months and days', () => {
    const mar3 = new Date(2026, 2, 3);
    expect(fmtDate(mar3)).toBe('2026-03-03');
  });
});

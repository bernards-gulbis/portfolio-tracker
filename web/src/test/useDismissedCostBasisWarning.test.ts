import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDismissedCostBasisWarning } from '../hooks/useDismissedCostBasisWarning';

const storageKey = (id: number) => `pt_cost_basis_dismissed_${id}`;

function setDismissed(portfolioId: number, tickers: string[]): void {
  globalThis.localStorage.setItem(storageKey(portfolioId), JSON.stringify(tickers));
}

function getDismissed(portfolioId: number): string[] {
  const raw = globalThis.localStorage.getItem(storageKey(portfolioId));
  if (raw == null) return [];
  return JSON.parse(raw) as string[];
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('useDismissedCostBasisWarning', () => {
  it('shouldShow is true when no tickers have been dismissed', () => {
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL', 'MSFT']),
    );
    expect(result.current.shouldShow).toBe(true);
  });

  it('shouldShow is false when no currentTickers are provided', () => {
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, []),
    );
    expect(result.current.shouldShow).toBe(false);
  });

  it('shouldShow is false when all currentTickers are already dismissed', () => {
    setDismissed(1, ['AAPL', 'MSFT']);
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL', 'MSFT']),
    );
    expect(result.current.shouldShow).toBe(false);
  });

  it('shouldShow is true when some currentTickers are not yet dismissed', () => {
    setDismissed(1, ['AAPL']);
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL', 'MSFT']),
    );
    expect(result.current.shouldShow).toBe(true);
  });

  it('dismiss() hides the warning and persists to localStorage', () => {
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL', 'MSFT']),
    );

    expect(result.current.shouldShow).toBe(true);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.shouldShow).toBe(false);
    const stored = getDismissed(1);
    expect(stored).toContain('AAPL');
    expect(stored).toContain('MSFT');
  });

  it('dismiss() merges with existing dismissed tickers in storage', () => {
    setDismissed(1, ['GOOG']);
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL']),
    );

    act(() => {
      result.current.dismiss();
    });

    const stored = getDismissed(1);
    expect(stored).toContain('GOOG');
    expect(stored).toContain('AAPL');
  });

  it('dismiss() does not create duplicate entries', () => {
    setDismissed(1, ['AAPL']);
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL']),
    );

    act(() => {
      result.current.dismiss();
    });

    const stored = getDismissed(1);
    const aaplCount = stored.filter((t) => t === 'AAPL').length;
    expect(aaplCount).toBe(1);
  });

  it('reads fresh from storage when portfolioId changes', () => {
    // Portfolio 2 already has AAPL dismissed
    setDismissed(2, ['AAPL']);

    // Start on portfolio 1 — nothing dismissed there
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useDismissedCostBasisWarning(id, ['AAPL']),
      { initialProps: { id: 1 } },
    );

    expect(result.current.shouldShow).toBe(true);

    // Switch to portfolio 2 — should read from storage and detect AAPL is dismissed
    rerender({ id: 2 });

    expect(result.current.shouldShow).toBe(false);
  });

  it('handles corrupted localStorage gracefully (returns empty dismissed list)', () => {
    globalThis.localStorage.setItem(storageKey(1), 'not-valid-json{{{');
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL']),
    );
    // Corrupted JSON is treated as empty dismissed list
    expect(result.current.shouldShow).toBe(true);
  });

  it('handles non-array JSON in localStorage gracefully', () => {
    globalThis.localStorage.setItem(storageKey(1), JSON.stringify({ AAPL: true }));
    const { result } = renderHook(() =>
      useDismissedCostBasisWarning(1, ['AAPL']),
    );
    // Non-array is treated as empty
    expect(result.current.shouldShow).toBe(true);
  });
});

import { useCallback, useState } from 'react';

const storageKey = (portfolioId: number) => `pt_cost_basis_dismissed_${portfolioId}`;

function readDismissed(portfolioId: number): string[] {
  try {
    const raw = globalThis.localStorage.getItem(storageKey(portfolioId));
    if (raw == null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(portfolioId: number, tickers: string[]): void {
  try {
    globalThis.localStorage.setItem(storageKey(portfolioId), JSON.stringify(tickers));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function useDismissedCostBasisWarning(
  portfolioId: number,
  currentTickers: string[],
): { shouldShow: boolean; dismiss: () => void } {
  const [state, setState] = useState(() => ({
    portfolioId,
    tickers: readDismissed(portfolioId),
  }));

  if (state.portfolioId !== portfolioId) {
    setState({ portfolioId, tickers: readDismissed(portfolioId) });
  }

  const dismissedTickers = state.portfolioId === portfolioId ? state.tickers : [];
  const shouldShow = currentTickers.some((ticker) => !dismissedTickers.includes(ticker));

  const dismiss = useCallback(() => {
    setState((prev) => {
      const existing = prev.portfolioId === portfolioId ? prev.tickers : readDismissed(portfolioId);
      const merged = Array.from(new Set([...existing, ...currentTickers]));
      writeDismissed(portfolioId, merged);
      return { portfolioId, tickers: merged };
    });
  }, [portfolioId, currentTickers]);

  return { shouldShow, dismiss };
}

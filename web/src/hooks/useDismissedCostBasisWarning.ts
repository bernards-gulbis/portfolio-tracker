import { useState } from 'react';

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
  const [cached, setCached] = useState(() => ({
    portfolioId,
    tickers: readDismissed(portfolioId),
  }));

  // When the user navigates to a different portfolio, read fresh from storage
  // rather than using stale cached tickers from the previous portfolio.
  const dismissedTickers =
    cached.portfolioId === portfolioId ? cached.tickers : readDismissed(portfolioId);

  const shouldShow = currentTickers.some((t) => !dismissedTickers.includes(t));

  const dismiss = () => {
    setCached((prev) => {
      const existing =
        prev.portfolioId === portfolioId ? prev.tickers : readDismissed(portfolioId);
      const merged = Array.from(new Set([...existing, ...currentTickers]));
      writeDismissed(portfolioId, merged);
      return { portfolioId, tickers: merged };
    });
  };

  return { shouldShow, dismiss };
}

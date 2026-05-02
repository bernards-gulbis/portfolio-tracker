import { useMemo } from 'react';

import { parsePortfolioId } from '../utils/parsePortfolioId';

const STORAGE_KEY = 'pt_last_portfolio_id';

function read(): number | null {
  try {
    return parsePortfolioId(globalThis.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function write(id: number | null): void {
  try {
    if (id != null && Number.isInteger(id) && id > 0) {
      globalThis.localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function useLastVisitedPortfolio() {
  return useMemo(() => ({ get: read, set: write }), []);
}

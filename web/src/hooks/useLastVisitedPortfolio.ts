import { useMemo } from 'react';

const STORAGE_KEY = 'pt_last_portfolio_id';

function read(): number | null {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
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

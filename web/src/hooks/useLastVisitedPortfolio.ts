import { useCallback } from 'react';

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
    if (id == null || !Number.isInteger(id) || id <= 0) {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

export function useLastVisitedPortfolio() {
  const get = useCallback((): number | null => read(), []);
  const set = useCallback((id: number | null) => write(id), []);
  return { get, set };
}

import { useCallback, useState } from 'react';

export type TableViewMode = 'grouped' | 'ungrouped';

function isViewMode(value: unknown): value is TableViewMode {
  return value === 'grouped' || value === 'ungrouped';
}

function readPreference(storageKey: string, defaultMode: TableViewMode): TableViewMode {
  if (globalThis.window === undefined) return defaultMode;
  try {
    const stored = localStorage.getItem(storageKey);
    if (isViewMode(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  return defaultMode;
}

export interface UseTableViewModeResult {
  viewMode: TableViewMode;
  setViewMode: (mode: TableViewMode) => void;
}

export function useTableViewMode(
  storageKey: string,
  defaultMode: TableViewMode = 'grouped',
): UseTableViewModeResult {
  const [viewMode, setViewMode] = useState<TableViewMode>(() => readPreference(storageKey, defaultMode));

  const persistAndSet = useCallback((mode: TableViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      // localStorage unavailable
    }
  }, [storageKey]);

  return { viewMode, setViewMode: persistAndSet };
}

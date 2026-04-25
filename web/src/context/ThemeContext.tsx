import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';

type ResolvedTheme = 'light' | 'dark';
type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  /** The user's preference (light | dark | system) */
  preference: ThemePreference;
  /** The resolved theme applied to the document (light | dark) */
  theme: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (globalThis.window === undefined) return 'dark';
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeSystemTheme(callback: () => void): () => void {
  if (globalThis.window === undefined) return () => {};
  const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSystemThemeServer(): ResolvedTheme {
  return 'dark';
}

function readPreference(): ThemePreference {
  if (globalThis.window === undefined) return 'system';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // localStorage unavailable
  }
  return 'system';
}


export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  // useSyncExternalStore handles subscription, snapshot, and tearing-safety in one
  // call — and resyncs on mount automatically if the OS scheme shifted between
  // initial render and the listener attaching.
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemTheme, getSystemThemeServer);
  const resolved: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  const persistAndSetPreference = useCallback((p: ThemePreference) => {
    setPreference(p);
    try {
      localStorage.setItem('theme', p);
    } catch {
      // localStorage unavailable
    }
  }, [setPreference]);

  // Apply to document
  useEffect(() => {
    if (globalThis.window === undefined) return;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const toggleTheme = useCallback(() => {
    persistAndSetPreference(resolved === 'light' ? 'dark' : 'light');
  }, [resolved, persistAndSetPreference]);

  const value = useMemo(
    () => ({ preference, theme: resolved, setPreference: persistAndSetPreference, toggleTheme }),
    [preference, resolved, persistAndSetPreference, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

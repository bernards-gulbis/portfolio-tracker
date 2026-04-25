import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

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
  // Track OS-level system theme separately so it can update reactively
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  // resolved is derived purely — no setState-in-effect needed
  const resolved: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  const persistAndSetPreference = useCallback((p: ThemePreference) => {
    setPreference(p);
    try {
      localStorage.setItem('theme', p);
    } catch {
      // localStorage unavailable
    }
  }, [setPreference]);

  // Always listen for OS theme changes so systemTheme stays current even when
  // preference !== 'system' — otherwise switching back to 'system' would briefly
  // show a stale value until the next OS change event.
  useEffect(() => {
    if (globalThis.window === undefined) return;
    const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

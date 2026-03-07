import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Page = 'portfolio' | 'settings';

interface NavigationContextValue {
  page: Page;
  activePortfolioId: number | null;
  goToPortfolio: (id: number) => void;
  goToFirstPortfolio: () => void;
  goToSettings: () => void;
}

const STORAGE_KEY = 'pt_last_portfolio';

const NavigationContext = createContext<NavigationContextValue | null>(null);

function readStoredPortfolioId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function NavigationProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [page, setPage] = useState<Page>('portfolio');
  const [activePortfolioId, setActivePortfolioId] = useState<number | null>(readStoredPortfolioId);

  const goToPortfolio = useCallback((id: number) => {
    setActivePortfolioId(id);
    setPage('portfolio');
    try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* ignore */ }
  }, []);

  const goToFirstPortfolio = useCallback(() => {
    setActivePortfolioId(null);
    setPage('portfolio');
  }, []);

  const goToSettings = useCallback(() => {
    setPage('settings');
  }, []);

  // Reset state on logout
  useEffect(() => {
    const handleLogout = () => {
      setPage('portfolio');
      setActivePortfolioId(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    };
    globalThis.addEventListener('auth:logout', handleLogout);
    return () => globalThis.removeEventListener('auth:logout', handleLogout);
  }, []);

  const value = useMemo(
    () => ({ page, activePortfolioId, goToPortfolio, goToFirstPortfolio, goToSettings }),
    [page, activePortfolioId, goToPortfolio, goToFirstPortfolio, goToSettings],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside NavigationProvider');
  return ctx;
}

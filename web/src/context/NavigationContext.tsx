import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Page = 'portfolio' | 'settings';

interface NavigationContextValue {
  page: Page;
  activePortfolioId: number | null;
  goToPortfolio: (id: number) => void;
  goToFirstPortfolio: () => void;
  goToSettings: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [page, setPage] = useState<Page>('portfolio');
  const [activePortfolioId, setActivePortfolioId] = useState<number | null>(null);

  const goToPortfolio = useCallback((id: number) => {
    setActivePortfolioId(id);
    setPage('portfolio');
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

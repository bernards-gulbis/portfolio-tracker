import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface PortfolioContextType {
  activePortfolioId: number | null;
  setActivePortfolioId: (id: number | null) => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
  const [activePortfolioId, setActivePortfolioId] = useState<number | null>(null);

  // Reset selected portfolio when the user logs out so the next user starts clean.
  useEffect(() => {
    const handleLogout = () => setActivePortfolioId(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  return (
    <PortfolioContext.Provider value={{ activePortfolioId, setActivePortfolioId }}>
      {children}
    </PortfolioContext.Provider>
  );
};

export const usePortfolioContext = () => {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error('usePortfolioContext must be used within a PortfolioProvider');
  }
  return context;
};

import { createContext, useContext, useState, ReactNode } from 'react';

interface PortfolioContextType {
  activePortfolioId: number | null;
  setActivePortfolioId: (id: number | null) => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider = ({ children }: { children: ReactNode }) => {
  const [activePortfolioId, setActivePortfolioId] = useState<number | null>(null);

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

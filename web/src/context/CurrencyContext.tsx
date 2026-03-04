import { createContext, useContext, useState, useCallback, useMemo, type FC, type ReactNode } from 'react';

const STORAGE_KEY = 'pt_currency';
export type Currency = 'EUR' | 'USD';

function readPreference(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'USD' || stored === 'EUR') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'EUR';
}

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<Currency>(readPreference);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const value = useMemo(() => ({ currency, setCurrency }), [currency, setCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrencyPreference = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrencyPreference must be used within a CurrencyProvider');
  }
  return context;
};

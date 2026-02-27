import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pt_currency';
type Currency = 'EUR' | 'USD';

function readPreference(): Currency {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'USD' || stored === 'EUR') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'EUR';
}

export const useCurrencyPreference = (): { currency: Currency; toggle: () => void } => {
  const [currency, setCurrency] = useState<Currency>(readPreference);

  const toggle = useCallback(() => {
    setCurrency((prev) => {
      const next: Currency = prev === 'EUR' ? 'USD' : 'EUR';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return { currency, toggle };
};

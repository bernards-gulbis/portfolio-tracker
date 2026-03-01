import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCurrencyPreference } from '../hooks/useCurrencyPreference';

const STORAGE_KEY = 'pt_currency';

describe('useCurrencyPreference', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults to EUR', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('EUR');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('USD');
  });

  it('toggles from EUR to USD', () => {
    const { result } = renderHook(() => useCurrencyPreference());
    expect(result.current.currency).toBe('EUR');

    act(() => {
      result.current.toggle();
    });

    expect(result.current.currency).toBe('USD');
  });

  it('toggles from USD back to EUR', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.currency).toBe('EUR');
  });

  it('persists toggle to localStorage', () => {
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.toggle();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('USD');
  });

  it('persists back to EUR in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference());

    act(() => {
      result.current.toggle();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('EUR');
  });
});

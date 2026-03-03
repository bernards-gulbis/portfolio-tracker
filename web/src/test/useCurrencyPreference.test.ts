import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { useCurrencyPreference, CurrencyProvider } from '../hooks/useCurrencyPreference';

const STORAGE_KEY = 'pt_currency';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(CurrencyProvider, null, children);

describe('useCurrencyPreference', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('defaults to EUR', () => {
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });
    expect(result.current.currency).toBe('EUR');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });
    expect(result.current.currency).toBe('USD');
  });

  it('sets currency to USD', () => {
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });
    expect(result.current.currency).toBe('EUR');

    act(() => {
      result.current.setCurrency('USD');
    });

    expect(result.current.currency).toBe('USD');
  });

  it('sets currency to EUR from USD', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });

    act(() => {
      result.current.setCurrency('EUR');
    });

    expect(result.current.currency).toBe('EUR');
  });

  it('persists set to localStorage', () => {
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });

    act(() => {
      result.current.setCurrency('USD');
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('USD');
  });

  it('defaults to EUR when localStorage has invalid value', () => {
    localStorage.setItem(STORAGE_KEY, 'GBP');
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });
    expect(result.current.currency).toBe('EUR');
  });

  it('persists back to EUR in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'USD');
    const { result } = renderHook(() => useCurrencyPreference(), { wrapper });

    act(() => {
      result.current.setCurrency('EUR');
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('EUR');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(ThemeProvider, null, children);

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('dark');
  });

  it('defaults to system preference', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('system');
    // matchMedia is mocked to return matches: false → 'light'
    expect(result.current.theme).toBe('light');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('dark');
    expect(result.current.theme).toBe('dark');
  });

  it('toggleTheme switches from light to dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');

    act(() => { result.current.toggleTheme(); });

    expect(result.current.preference).toBe('dark');
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggleTheme switches from dark to light', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => { result.current.toggleTheme(); });

    expect(result.current.preference).toBe('light');
    expect(result.current.theme).toBe('light');
  });

  it('setPreference persists to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => { result.current.setPreference('dark'); });

    expect(localStorage.getItem('theme')).toBe('dark');
    expect(result.current.preference).toBe('dark');
  });

  it('ignores invalid localStorage value and defaults to system', () => {
    localStorage.setItem('theme', 'invalid');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('system');
  });
});

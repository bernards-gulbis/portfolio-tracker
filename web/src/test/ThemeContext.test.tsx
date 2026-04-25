import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(ThemeProvider, null, children);

type MqHandler = (event: { matches: boolean }) => void;

function installMatchMediaMock(initialMatches: boolean) {
  const handlers = new Set<MqHandler>();
  const mq = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((event: string, handler: MqHandler) => {
      if (event === 'change') handlers.add(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: MqHandler) => {
      if (event === 'change') handlers.delete(handler);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  const original = globalThis.matchMedia;
  globalThis.matchMedia = vi.fn(() => mq) as unknown as typeof globalThis.matchMedia;
  return {
    fireChange(matches: boolean) {
      mq.matches = matches;
      handlers.forEach((h) => h({ matches }));
    },
    restore() {
      globalThis.matchMedia = original;
    },
  };
}

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

  describe('matchMedia listener', () => {
    let mq: ReturnType<typeof installMatchMediaMock>;

    afterEach(() => {
      mq?.restore();
    });

    it('updates resolved theme when OS theme changes and preference is system', () => {
      mq = installMatchMediaMock(false); // OS starts light
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.preference).toBe('system');
      expect(result.current.theme).toBe('light');

      act(() => { mq.fireChange(true); }); // OS shifts to dark

      expect(result.current.theme).toBe('dark');
    });

    it('keeps systemTheme current even when preference is not system, so toggling back reflects current OS', () => {
      mq = installMatchMediaMock(false); // OS starts light
      localStorage.setItem('theme', 'light'); // user prefers explicit light
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('light');

      // OS shifts to dark while user is on 'light' — visible theme stays light…
      act(() => { mq.fireChange(true); });
      expect(result.current.theme).toBe('light');

      // …but switching to system now reflects the current OS theme (dark), not a stale value.
      act(() => { result.current.setPreference('system'); });
      expect(result.current.theme).toBe('dark');
    });
  });
});

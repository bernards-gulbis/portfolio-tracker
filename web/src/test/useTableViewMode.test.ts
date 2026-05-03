import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableViewMode } from '../hooks/useTableViewMode';

const KEY = 'pt_test_view_mode';

describe('useTableViewMode', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('defaults to grouped when no preference stored', () => {
    const { result } = renderHook(() => useTableViewMode(KEY));
    expect(result.current.viewMode).toBe('grouped');
  });

  it('respects an explicit default of ungrouped', () => {
    const { result } = renderHook(() => useTableViewMode(KEY, 'ungrouped'));
    expect(result.current.viewMode).toBe('ungrouped');
  });

  it('reads stored preference from localStorage', () => {
    localStorage.setItem(KEY, 'ungrouped');
    const { result } = renderHook(() => useTableViewMode(KEY));
    expect(result.current.viewMode).toBe('ungrouped');
  });

  it('falls back to default for invalid stored values', () => {
    localStorage.setItem(KEY, 'tabular');
    const { result } = renderHook(() => useTableViewMode(KEY));
    expect(result.current.viewMode).toBe('grouped');
  });

  it('updates state when setViewMode is called', () => {
    const { result } = renderHook(() => useTableViewMode(KEY));

    act(() => {
      result.current.setViewMode('ungrouped');
    });

    expect(result.current.viewMode).toBe('ungrouped');
  });

  it('persists set value to localStorage', () => {
    const { result } = renderHook(() => useTableViewMode(KEY));

    act(() => {
      result.current.setViewMode('ungrouped');
    });

    expect(localStorage.getItem(KEY)).toBe('ungrouped');
  });

  it('persists back to grouped in localStorage', () => {
    localStorage.setItem(KEY, 'ungrouped');
    const { result } = renderHook(() => useTableViewMode(KEY));

    act(() => {
      result.current.setViewMode('grouped');
    });

    expect(localStorage.getItem(KEY)).toBe('grouped');
  });

  it('keeps state isolated per storage key', () => {
    const a = renderHook(() => useTableViewMode('pt_test_a'));
    const b = renderHook(() => useTableViewMode('pt_test_b'));

    act(() => {
      a.result.current.setViewMode('ungrouped');
    });

    expect(a.result.current.viewMode).toBe('ungrouped');
    expect(b.result.current.viewMode).toBe('grouped');

    localStorage.removeItem('pt_test_a');
    localStorage.removeItem('pt_test_b');
  });
});

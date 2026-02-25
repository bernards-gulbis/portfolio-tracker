import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';

const renderWithRoute = (initialEntry: string, routePath: string) => {
  return renderHook(() => useActivePortfolioId(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={routePath} element={children} />
        </Routes>
      </MemoryRouter>
    ),
  });
};

describe('useActivePortfolioId', () => {
  it('returns null when no :id param in URL', () => {
    const { result } = renderWithRoute('/', '/');
    expect(result.current).toBeNull();
  });

  it('returns the numeric id for a valid integer', () => {
    const { result } = renderWithRoute('/portfolios/5', '/portfolios/:id');
    expect(result.current).toBe(5);
  });

  it('returns null for non-numeric id', () => {
    const { result } = renderWithRoute('/portfolios/abc', '/portfolios/:id');
    expect(result.current).toBeNull();
  });

  it('returns null for Infinity', () => {
    const { result } = renderWithRoute('/portfolios/Infinity', '/portfolios/:id');
    expect(result.current).toBeNull();
  });

  it('returns null for a decimal string', () => {
    const { result } = renderWithRoute('/portfolios/3.5', '/portfolios/:id');
    expect(result.current).toBeNull();
  });

  it('returns null for zero', () => {
    const { result } = renderWithRoute('/portfolios/0', '/portfolios/:id');
    expect(result.current).toBeNull();
  });

  it('returns null for negative integer', () => {
    const { result } = renderWithRoute('/portfolios/-1', '/portfolios/:id');
    expect(result.current).toBeNull();
  });
});

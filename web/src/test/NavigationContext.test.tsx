import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useNavigation, NavigationProvider } from '../context/NavigationContext';
import { createElement, type ReactNode } from 'react';

function TestConsumer() {
  const nav = useNavigation();
  return (
    <div>
      <span data-testid="page">{nav.page}</span>
      <span data-testid="portfolio-id">{nav.activePortfolioId ?? 'null'}</span>
      <button onClick={() => nav.goToPortfolio(42)}>goToPortfolio</button>
      <button onClick={() => nav.goToFirstPortfolio()}>goToFirstPortfolio</button>
      <button onClick={() => nav.goToTransactions()}>goToTransactions</button>
      <button onClick={() => nav.goToSettings()}>goToSettings</button>
    </div>
  );
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(NavigationProvider, null, children);

describe('NavigationContext', () => {
  it('starts on portfolio page with no active portfolio', () => {
    render(<TestConsumer />, { wrapper });
    expect(screen.getByTestId('page').textContent).toBe('portfolio');
    expect(screen.getByTestId('portfolio-id').textContent).toBe('null');
  });

  it('goToPortfolio sets activePortfolioId and page to portfolio', () => {
    render(<TestConsumer />, { wrapper });
    act(() => {
      screen.getByText('goToPortfolio').click();
    });
    expect(screen.getByTestId('page').textContent).toBe('portfolio');
    expect(screen.getByTestId('portfolio-id').textContent).toBe('42');
  });

  it('goToFirstPortfolio resets activePortfolioId to null', () => {
    render(<TestConsumer />, { wrapper });
    act(() => {
      screen.getByText('goToPortfolio').click();
    });
    expect(screen.getByTestId('portfolio-id').textContent).toBe('42');

    act(() => {
      screen.getByText('goToFirstPortfolio').click();
    });
    expect(screen.getByTestId('portfolio-id').textContent).toBe('null');
    expect(screen.getByTestId('page').textContent).toBe('portfolio');
  });

  it('goToTransactions sets page to transactions', () => {
    render(<TestConsumer />, { wrapper });
    act(() => {
      screen.getByText('goToTransactions').click();
    });
    expect(screen.getByTestId('page').textContent).toBe('transactions');
  });

  it('goToSettings sets page to settings', () => {
    render(<TestConsumer />, { wrapper });
    act(() => {
      screen.getByText('goToSettings').click();
    });
    expect(screen.getByTestId('page').textContent).toBe('settings');
  });

  it('resets page and portfolio on auth:logout event', () => {
    render(<TestConsumer />, { wrapper });
    act(() => {
      screen.getByText('goToPortfolio').click();
      screen.getByText('goToSettings').click();
    });
    expect(screen.getByTestId('page').textContent).toBe('settings');
    expect(screen.getByTestId('portfolio-id').textContent).toBe('42');

    act(() => {
      globalThis.dispatchEvent(new Event('auth:logout'));
    });
    expect(screen.getByTestId('page').textContent).toBe('portfolio');
    expect(screen.getByTestId('portfolio-id').textContent).toBe('null');
  });

  it('throws when useNavigation is used outside NavigationProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useNavigation must be used inside NavigationProvider'
    );
    spy.mockRestore();
  });
});

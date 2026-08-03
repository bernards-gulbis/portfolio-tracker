/**
 * Tests for App.tsx AuthGuard branches (loading / unauthenticated) and the
 * RootRedirect error path.  These states cannot be exercised from App.test.tsx
 * because that file mocks useAuth at module level to always return
 * "authenticated".  A separate file with its own vi.mock factory is required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Hoisted state so mock factories (which run before module init) can read them.
const mutableState = vi.hoisted(() => ({
  authStatus: 'authenticated' as 'loading' | 'authenticated' | 'unauthenticated',
  initialRoute: '/portfolios/1' as string,
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  const { MemoryRouter } = actual;
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[mutableState.initialRoute]}>{children}</MemoryRouter>
    ),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ status: mutableState.authStatus, user: null }),
}));

vi.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', preference: 'system', setPreference: vi.fn() }),
}));

vi.mock('../hooks/useAuth', () => ({
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
}));

vi.mock('../hooks/usePortfolioStatus', () => ({
  usePortfolioStatus: vi.fn(),
}));

vi.mock('../hooks/useLastVisitedPortfolio', () => ({
  useLastVisitedPortfolio: () => ({ get: () => null, set: vi.fn() }),
}));

vi.mock('../hooks/useCurrencyPreference', () => ({
  CurrencyProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useCurrencyPreference: () => ({ currency: 'USD', setCurrency: vi.fn() }),
}));

vi.mock('../components/PortfolioSwitcher', () => ({
  PortfolioSwitcher: () => <div data-testid="portfolio-switcher" />,
}));

vi.mock('../components/PortfolioActions', () => ({
  PortfolioActions: () => <div data-testid="portfolio-actions" />,
}));

vi.mock('../components/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));

vi.mock('../components/portfolio-status/PortfolioStatusView', () => ({
  PortfolioStatusView: () => <div data-testid="portfolio-status-view" />,
}));

vi.mock('../components/TransactionView', () => ({
  TransactionView: () => <div data-testid="transaction-view" />,
}));

vi.mock('../components/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page" />,
}));

vi.mock('../components/CreatePortfolioModal', () => ({
  CreatePortfolioModal: () => null,
}));

vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppFooter', () => ({
  AppFooter: () => null,
}));

import { usePortfolios } from '../hooks/usePortfolios';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import App from '../App';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderApp = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mutableState.authStatus = 'authenticated';
  mutableState.initialRoute = '/portfolios/1';

  vi.mocked(usePortfolios).mockReturnValue({
    data: [{ id: 1, name: 'Portfolio 1' }],
    isLoading: false,
    isFetching: false,
    error: null,
  } as unknown as ReturnType<typeof usePortfolios>);

  vi.mocked(usePortfolioStatus).mockReturnValue({
    data: {
      portfolio_id: 1,
      portfolio_name: 'Portfolio 1',
      principal: 1000,
      principal_eur: 920,
      principal_eur_avg: 920,
      dividends: 0,
      dividends_eur: 0,
      cash: 0,
      holdings: [{ ticker: 'AAPL', quantity: 1, average_cost: 100, total_cost: 100, first_buy_date: '2024-01-01' }],
      holdings_cost: 100,
      realized_gains: 0,
      realized_sales: [],
      dividends_received: [],
      realized_withdrawals: [],
      capital_gains_tax_rate: 0,
      warnings: [],
      usd_to_eur_rate: null,
      eur_incomplete: false,
      fx_missing_tx_ids: [],
      transaction_count: 5,
    },
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof usePortfolioStatus>);
});

describe('AuthGuard — loading state', () => {
  it('renders a loading spinner while auth status is being determined', () => {
    mutableState.authStatus = 'loading';
    renderApp();

    // The loading spinner — Spinner component or animate-spin in the DOM
    const spinner = document.querySelector('[class*="animate-spin"]');
    expect(spinner ?? screen.queryByRole('status')).toBeTruthy();
  });

  it('does not render the app chrome when auth is loading', () => {
    mutableState.authStatus = 'loading';
    renderApp();

    expect(screen.queryByTestId('portfolio-switcher')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});

describe('AuthGuard — unauthenticated state', () => {
  it('renders the LoginPage when the user is not authenticated', () => {
    mutableState.authStatus = 'unauthenticated';
    renderApp();

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('does not render the app layout (sidebar / switcher) when unauthenticated', () => {
    mutableState.authStatus = 'unauthenticated';
    renderApp();

    expect(screen.queryByTestId('portfolio-switcher')).not.toBeInTheDocument();
  });
});

describe('RootRedirect — error path', () => {
  it('shows an alert when the portfolios query fails on the root route', async () => {
    mutableState.initialRoute = '/';
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('Network error'),
    } as unknown as ReturnType<typeof usePortfolios>);

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

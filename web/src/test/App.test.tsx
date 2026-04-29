import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PortfolioStatus } from '../api';

// Hoisted state so vi.mock's factory (which runs before module init) can read it.
const routing = vi.hoisted(() => ({
  initialEntries: ['/portfolios/1'] as string[],
  navigateMock: { fn: undefined as unknown as ReturnType<typeof vi.fn> },
}));
routing.navigateMock.fn = vi.fn();
const navigateMock = routing.navigateMock.fn;

// Substitute BrowserRouter with MemoryRouter so initialEntries drives the URL.
// useNavigate is mocked so we can assert tab clicks etc. without observing the
// in-memory history. All other react-router exports pass through.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const { MemoryRouter } = actual;
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={routing.initialEntries}>{children}</MemoryRouter>
    ),
    useNavigate: () => routing.navigateMock.fn,
  };
});

const mockLogoutMutate = vi.fn();
const mockSetThemePreference = vi.fn();
const mockSetCurrency = vi.fn();

vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ status: 'authenticated', user: { email: 'test@test.com', name: 'Test' } }),
}));

vi.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', preference: 'system', setPreference: mockSetThemePreference }),
}));

vi.mock('../hooks/useAuth', () => ({
  useLogout: () => ({ mutate: mockLogoutMutate, isPending: false }),
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
  useCurrencyPreference: () => ({ currency: 'USD', setCurrency: mockSetCurrency }),
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

vi.mock('../components/PortfolioStatusView', () => ({
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

const mockPortfolios = [
  { id: 1, name: 'Portfolio 1' },
  { id: 2, name: 'Portfolio 2' },
];

const mockBrandNewStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Portfolio 1',
  principal: 0,
  principal_eur: 0,
  principal_eur_avg: 0,
  dividends: 0,
  dividends_eur: 0,
  cash: 0,
  holdings: [],
  holdings_cost: 0,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0,
  warnings: [],
  usd_to_eur_rate: null,
  eur_incomplete: false,
  fx_missing_tx_ids: [],
};

const mockStatusWithHoldings: PortfolioStatus = {
  ...mockBrandNewStatus,
  principal: 8000,
  holdings: [
    { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1500, first_buy_date: '2024-01-01' },
  ],
};

const renderApp = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
};

function setupDefaultMocks(): void {
  vi.clearAllMocks();
  routing.initialEntries = ['/portfolios/1'];

  vi.mocked(usePortfolios).mockReturnValue({
    data: mockPortfolios,
    isLoading: false,
    isFetching: false,
    error: null,
  } as unknown as ReturnType<typeof usePortfolios>);

  vi.mocked(usePortfolioStatus).mockReturnValue({
    data: mockStatusWithHoldings,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof usePortfolioStatus>);
}

describe('AppLayout', () => {
  beforeEach(setupDefaultMocks);

  describe('auto-navigate for brand-new portfolios', () => {
    it('redirects to transactions when portfolio is brand-new', async () => {
      vi.mocked(usePortfolioStatus).mockReturnValue({
        data: mockBrandNewStatus,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof usePortfolioStatus>);

      renderApp();

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/portfolios/1/transactions', { replace: true });
      });
    });

    it('does not redirect when portfolio has holdings', () => {
      renderApp();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('tabs navigation', () => {
    it('renders Summary and Transactions tabs when portfolio is active', () => {
      renderApp();
      expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /transactions/i })).toBeInTheDocument();
    });

    it('does not render tabs on settings page', () => {
      routing.initialEntries = ['/settings'];
      renderApp();
      expect(screen.queryByRole('tab', { name: /summary/i })).not.toBeInTheDocument();
    });

    it('navigates to /portfolios/:id/transactions when clicking Transactions tab', async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('tab', { name: /transactions/i }));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/portfolios/1/transactions');
      });
    });

    it('navigates to /portfolios/:id when clicking Summary tab from transactions page', async () => {
      routing.initialEntries = ['/portfolios/1/transactions'];
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('tab', { name: /summary/i }));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/portfolios/1');
      });
    });
  });
});

describe('AppLayout content & user menu', () => {
  beforeEach(setupDefaultMocks);

  it('renders the settings page on /settings', () => {
    routing.initialEntries = ['/settings'];
    renderApp();
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
  });

  it('renders the portfolio status view on /portfolios/:id', () => {
    routing.initialEntries = ['/portfolios/1'];
    renderApp();
    expect(screen.getByTestId('portfolio-status-view')).toBeInTheDocument();
  });

  it('renders the transaction view on /portfolios/:id/transactions', () => {
    routing.initialEntries = ['/portfolios/1/transactions'];
    renderApp();
    expect(screen.getByTestId('transaction-view')).toBeInTheDocument();
  });

  it('renders an empty state on / when there are no portfolios', () => {
    routing.initialEntries = ['/'];
    vi.mocked(usePortfolios).mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderApp();
    expect(screen.getByText(/no portfolios/i)).toBeInTheDocument();
  });

  it('renders a loading skeleton on / while portfolios are loading', () => {
    routing.initialEntries = ['/'];
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    const { container } = renderApp();
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('navigates to /settings when the Settings menu item is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /settings/i }));

    expect(navigateMock).toHaveBeenCalledWith('/settings');
  });

  it('triggers logout when Sign Out is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /user menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }));

    expect(mockLogoutMutate).toHaveBeenCalled();
  });
});

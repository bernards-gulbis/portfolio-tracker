import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PortfolioStatus } from '../api';

const mockNavigation = {
  page: 'portfolio' as 'portfolio' | 'transactions' | 'settings',
  activePortfolioId: 1 as number | null,
  goToPortfolio: vi.fn(),
  goToFirstPortfolio: vi.fn(),
  goToTransactions: vi.fn(),
  goToSettings: vi.fn(),
};

vi.mock('../context/NavigationContext', () => ({
  NavigationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useNavigation: () => mockNavigation,
}));

vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({ status: 'authenticated', user: { email: 'test@test.com', name: 'Test' } }),
}));

vi.mock('../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', preference: 'system', setPreference: vi.fn() }),
}));

vi.mock('../hooks/useAuth', () => ({
  useLogout: () => ({ mutate: vi.fn() }),
}));

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
}));

vi.mock('../hooks/usePortfolioStatus', () => ({
  usePortfolioStatus: vi.fn(),
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
  deposits_eur: 0,
  usd_to_eur_rate: null,
  fees: 0,
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

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigation.page = 'portfolio';
    mockNavigation.activePortfolioId = 1;

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
  });

  describe('auto-navigate for brand-new portfolios', () => {
    it('redirects to transactions when portfolio is brand-new', async () => {
      vi.mocked(usePortfolioStatus).mockReturnValue({
        data: mockBrandNewStatus,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof usePortfolioStatus>);

      renderApp();

      await waitFor(() => {
        expect(mockNavigation.goToTransactions).toHaveBeenCalledOnce();
      });
    });

    it('does not redirect when portfolio has holdings', () => {
      renderApp();

      expect(mockNavigation.goToTransactions).not.toHaveBeenCalled();
    });

    it('does not redirect when activePortfolioId is null', () => {
      mockNavigation.activePortfolioId = null;

      vi.mocked(usePortfolioStatus).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof usePortfolioStatus>);

      renderApp();

      expect(mockNavigation.goToTransactions).not.toHaveBeenCalled();
    });
  });

  describe('tabs navigation', () => {
    it('renders Summary and Transactions tabs when portfolio is active', () => {
      renderApp();

      expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /transactions/i })).toBeInTheDocument();
    });

    it('does not render tabs on settings page', () => {
      mockNavigation.page = 'settings';
      renderApp();

      expect(screen.queryByRole('tab', { name: /summary/i })).not.toBeInTheDocument();
    });

    it('does not render tabs when no portfolio is selected', () => {
      mockNavigation.activePortfolioId = null;
      renderApp();

      expect(screen.queryByRole('tab', { name: /summary/i })).not.toBeInTheDocument();
    });

    it('calls goToTransactions when clicking Transactions tab', async () => {
      const user = userEvent.setup();
      renderApp();

      mockNavigation.goToTransactions.mockClear();
      await user.click(screen.getByRole('tab', { name: /transactions/i }));

      await waitFor(() => {
        expect(mockNavigation.goToTransactions).toHaveBeenCalled();
      });
    });

    it('calls goToPortfolio when clicking Summary tab from transactions page', async () => {
      mockNavigation.page = 'transactions';
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole('tab', { name: /summary/i }));

      await waitFor(() => {
        expect(mockNavigation.goToPortfolio).toHaveBeenCalledWith(1);
      });
    });
  });
});

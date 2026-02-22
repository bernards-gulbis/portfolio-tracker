import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortfolioStatusView } from '../components/PortfolioStatusView';
import type { PortfolioStatus } from '../api';

vi.mock('../hooks/usePortfolioStatus', () => ({
  usePortfolioStatus: vi.fn(),
}));

vi.mock('../hooks/usePortfolioPerformance', () => ({
  usePortfolioPerformance: vi.fn(),
}));

vi.mock('../hooks/usePortfolios', () => ({
  useDeletePortfolio: vi.fn(),
  useUpdatePortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCopyPortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('../context/PortfolioContext', () => ({
  usePortfolioContext: vi.fn(),
}));

import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderComponent = (portfolioId: number | null) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PortfolioStatusView portfolioId={portfolioId} />
    </QueryClientProvider>
  );
};

const mockStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  current_value: 10000,
  current_value_eur: 9200,
  principal: 8000,
  principal_eur: 7360,
  dividends: 200,
  dividends_eur: 184,
  cash: 500,
  holdings: [
    {
      ticker: 'AAPL',
      quantity: 10,
      average_cost: 150,
      total_cost: 1500,
      current_price: 200,
      current_value: 2000,
      unrealized_gain_loss: 500,
      unrealized_gain_loss_percent: 33.33,
    },
  ],
  holdings_cost: 7500,
  holdings_value: 9500,
  unrealized_gains: 2000,
  unrealized_gains_percent: 25,
  unrealized_gains_eur: 1840,
  realized_gains: 0,
  currency_gains_eur: null,
  currency_gains_percent: null,
  capital_gains_eur: 1840,
  capital_gains_tax_rate: 0.255,
  tax_eur: 460,
  total_return_after_tax_eur: 1380,
  total_return_after_tax_percent: 18.75,
  current_value_after_tax_eur: 8740,
};

describe('PortfolioStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePortfolioPerformance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioPerformance>);
    vi.mocked(usePortfolioContext).mockReturnValue({
      activePortfolioId: null,
      setActivePortfolioId: vi.fn(),
    });
    vi.mocked(useDeletePortfolio).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDeletePortfolio>);
  });

  it('shows "Select a portfolio" message when portfolioId is null', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(null);

    expect(screen.getByText('Select a portfolio to view its status')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message on failure', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load status'),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.getByText(/Error loading portfolio status/)).toBeInTheDocument();
  });

  it('renders market value, net invested, dividends, tax, after-tax sections', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.getAllByText('Market Value').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Net Invested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dividends').length).toBeGreaterThan(0);
    expect(screen.getByText('Est. Tax (25.5%)')).toBeInTheDocument();
    expect(screen.getByText('After-tax Value')).toBeInTheDocument();
  });

  it('renders CASH row in holdings table', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.getAllByText('CASH').length).toBeGreaterThan(0);
  });

  it('renders ticker in holdings table', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
  });
});

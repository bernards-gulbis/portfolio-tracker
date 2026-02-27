import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useDeletePortfolio } from '../hooks/usePortfolios';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderComponent = (initialEntry: string = '/') => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<PortfolioStatusView />} />
          <Route path="/portfolios/:id" element={<PortfolioStatusView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const mockStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  current_value: 10000,
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
      unrealized_gain_loss_pct: 33.33,
    },
  ],
  holdings_cost: 7500,
  holdings_value: 9500,
  unrealized_gains: 2000,
  unrealized_gains_pct: 25,
  realized_gains: 0,
  capital_gains_tax_rate: 0.255,
  missing_prices: [],
  usd_to_eur_rate: 0.92,
  deposits_eur: 7360,
};

describe('PortfolioStatusView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePortfolioPerformance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioPerformance>);
    vi.mocked(useDeletePortfolio).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDeletePortfolio>);
  });

  it('shows "Select a portfolio" message when no portfolio in URL', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/');

    expect(screen.getByText('Select a portfolio to view its status')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message on failure', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load status'),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getByText(/Error loading portfolio status/)).toBeInTheDocument();
  });

  it('renders market value, net invested, dividends, tax, after-tax sections', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getAllByText('Market Value').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Net Invested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dividends').length).toBeGreaterThan(0);
    expect(screen.getByText('Est. Tax (25.5%)')).toBeInTheDocument();  // dynamic rate from status.capital_gains_tax_rate
    expect(screen.getByText('After-tax Value')).toBeInTheDocument();
  });

  it('renders CASH row in holdings table', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getAllByText('CASH').length).toBeGreaterThan(0);
  });

  it('renders ticker in holdings table', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getAllByText('AAPL').length).toBeGreaterThan(0);
  });

  it('shows empty portfolio alert when no transactions exist', () => {
    const emptyStatus: PortfolioStatus = {
      ...mockStatus,
      holdings: [],
      principal_eur: 0,
      principal: 0,
      cash: 0,
      current_value: 0,
      usd_to_eur_rate: null,
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: emptyStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it('does not show empty portfolio alert when transactions exist', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.queryByText(/no transactions yet/i)).not.toBeInTheDocument();
  });

  it('shows currency toggle button', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    // Toggle button shows USD / EUR
    expect(screen.getByRole('button', { name: /currency/i })).toBeInTheDocument();
  });

  it('shows EUR unavailable message when rate is null and EUR selected', () => {
    const noRateStatus: PortfolioStatus = {
      ...mockStatus,
      usd_to_eur_rate: null,
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: noRateStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    // By default currency is EUR — shows unavailable message
    expect(screen.getByText(/EUR unavailable/i)).toBeInTheDocument();
  });

  it('renders dashes for null monetary values', () => {
    const nullStatus: PortfolioStatus = {
      ...mockStatus,
      usd_to_eur_rate: null,
      dividends_eur: null,
      holdings: [
        {
          ticker: 'AAPL',
          quantity: 10,
          average_cost: 150,
          total_cost: 1500,
          current_price: null,
          current_value: null,
          unrealized_gain_loss: null,
          unrealized_gain_loss_pct: null,
        },
      ],
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: nullStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    // All null monetary values should render as '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

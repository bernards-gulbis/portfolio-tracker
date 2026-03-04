import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PortfolioStatusView } from '../components/PortfolioStatusView';
import { CurrencyProvider } from '../hooks/useCurrencyPreference';
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

vi.mock('../hooks/useLivePrices', () => ({
  useLivePrices: vi.fn(),
}));

import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { useLivePrices } from '../hooks/useLivePrices';

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
      <CurrencyProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/" element={<PortfolioStatusView />} />
            <Route path="/portfolios/:id" element={<PortfolioStatusView />} />
          </Routes>
        </MemoryRouter>
      </CurrencyProvider>
    </QueryClientProvider>
  );
};

const mockStatus: PortfolioStatus = {
  portfolio_id: 1,
  portfolio_name: 'Test Portfolio',
  principal: 8000,
  principal_eur: 7360,
  dividends: 200,
  dividends_eur: 184,
  cash: 500,
  holdings: [
    { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1500 },
  ],
  holdings_cost: 7500,
  realized_gains: 0,
  capital_gains_tax_rate: 0.255,
  warnings: [],
  usd_to_eur_rate: 0.92,
};

const mockLivePrices = {
  data: {
    prices: { AAPL: 200 },
    usd_to_eur_rate: 0.92,
    timestamp: '2026-03-03T12:00:00Z',
  },
  dataUpdatedAt: Date.now(),
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
    vi.mocked(useLivePrices).mockReturnValue(
      mockLivePrices as unknown as ReturnType<typeof useLivePrices>,
    );
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
    expect(screen.getByText('Est. Tax (25.5%)')).toBeInTheDocument();
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
      dividends: 0,
      dividends_eur: 0,
      usd_to_eur_rate: null,
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: emptyStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getByText(/once you add transactions below/i)).toBeInTheDocument();
  });

  it('does not show empty portfolio alert when transactions exist', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.queryByText(/once you add transactions below/i)).not.toBeInTheDocument();
  });

  it('renders transaction warnings when present', () => {
    const warningStatus: PortfolioStatus = {
      ...mockStatus,
      warnings: [
        { code: 'sellNotInHoldings', date: '2024-01-02T10:00:00', params: { ticker: 'UNKNOWN' } },
        { code: 'withdrawNegativeCash', date: '2024-01-02T14:30:00', params: { amount: '500', balance: '-400' } },
      ],
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: warningStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.getByText('Transaction warnings')).toBeInTheDocument();
    expect(screen.getByText(/Cannot sell UNKNOWN/)).toBeInTheDocument();
    expect(screen.getByText(/negative cash balance/)).toBeInTheDocument();
  });

  it('does not render warnings alert when warnings array is empty', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    expect(screen.queryByText('Transaction warnings')).not.toBeInTheDocument();
  });

  it('renders dashes when prices not yet loaded', () => {
    // No live prices → computePricedStatus returns null price fields → dashes
    vi.mocked(useLivePrices).mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useLivePrices>);

    const nullRateStatus: PortfolioStatus = {
      ...mockStatus,
      usd_to_eur_rate: null,
      dividends_eur: null,
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: nullRateStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent('/portfolios/1');

    // All null monetary values should render as '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

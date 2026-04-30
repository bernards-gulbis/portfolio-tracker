import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PortfolioStatusView } from '../components/portfolio-status/PortfolioStatusView';
import { CurrencyProvider } from '../hooks/useCurrencyPreference';
import type { PortfolioStatus } from '../api';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

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

const renderComponent = (portfolioId: number | null = null) => {
  const queryClient = createTestQueryClient();
  const initialPath = portfolioId == null ? '/' : `/portfolios/${portfolioId}`;
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/portfolios/:id" element={<PortfolioStatusView />} />
            <Route path="/" element={<PortfolioStatusView />} />
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
  principal_eur_avg: 7360,
  dividends: 200,
  dividends_eur: 184,
  cash: 500,
  holdings: [
    { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1500, first_buy_date: '2024-01-01' },
  ],
  holdings_cost: 7500,
  realized_gains: 0,
  realized_sales: [],
  dividends_received: [],
  realized_withdrawals: [],
  capital_gains_tax_rate: 0.255,
  warnings: [],
  usd_to_eur_rate: 0.92,
  eur_incomplete: false,
  fx_missing_tx_ids: [],
  transaction_count: 0,
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

  it('shows "Select a portfolio" message when no portfolio selected', () => {
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

  it('renders stat cards: Net Invested, Total Return, After-tax Value', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.getAllByText('Net Invested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total Return').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After-tax Value').length).toBeGreaterThan(0);
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

  it('shows empty portfolio alert when no transactions exist', () => {
    const emptyStatus: PortfolioStatus = {
      ...mockStatus,
      holdings: [],
      principal_eur: 0,
      principal_eur_avg: 0,
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

    renderComponent(1);

    expect(screen.getByText(/once you add transactions in the/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /transactions tab/i })).toBeInTheDocument();
  });

  it('does not show empty portfolio alert when transactions exist', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

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

    renderComponent(1);

    expect(screen.getByText('Transaction warnings')).toBeInTheDocument();
    expect(screen.getByText(/Cannot sell UNKNOWN/)).toBeInTheDocument();
    expect(screen.getByText(/negative cash balance/)).toBeInTheDocument();
  });

  it('renders multiple warnings sharing the same code and date without duplicate-key errors', () => {
    // Two dividends paid the same midnight timestamp for different tickers,
    // both fx-blind, would collide on `${code}-${date}` alone.
    const warningStatus: PortfolioStatus = {
      ...mockStatus,
      warnings: [
        { code: 'fxRateMissingTicker', date: '2024-01-02T00:00:00', params: { ticker: 'AAPL' } },
        { code: 'fxRateMissingTicker', date: '2024-01-02T00:00:00', params: { ticker: 'MSFT' } },
      ],
    };

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: warningStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderComponent(1);

      expect(screen.getByText(/AAPL transaction/)).toBeInTheDocument();
      expect(screen.getByText(/MSFT transaction/)).toBeInTheDocument();
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/two children with the same key/i),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does not render warnings alert when warnings array is empty', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    renderComponent(1);

    expect(screen.queryByText('Transaction warnings')).not.toBeInTheDocument();
  });

  it('shows no data empty state when status is undefined after loading', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: undefined,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    renderComponent(1);

    expect(screen.getByText('No status data available')).toBeInTheDocument();
  });

  it('shows inline error in place of the chart when the performance query fails', () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: mockLivePrices.data,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    vi.mocked(usePortfolioPerformance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    } as unknown as ReturnType<typeof usePortfolioPerformance>);

    renderComponent(1);

    expect(screen.getByText(/Failed to load performance data.*boom/i)).toBeInTheDocument();
    expect(screen.queryByText('No performance data available')).not.toBeInTheDocument();
  });

  it('shows live price error banner when live prices fail', () => {
    const livePriceError = new Error('Price fetch failed');

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: mockLivePrices.data,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: livePriceError,
    } as unknown as ReturnType<typeof useLivePrices>);

    renderComponent(1);

    expect(screen.getByText('Live prices temporarily unavailable')).toBeInTheDocument();
  });

  it('calls invalidateQueries when refresh button is clicked', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    queryClient.invalidateQueries = invalidateQueries;

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: mockLivePrices.data,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    render(
      <QueryClientProvider client={queryClient}>
        <CurrencyProvider>
          <MemoryRouter initialEntries={['/portfolios/1']}>
            <Routes>
              <Route path="/portfolios/:id" element={<PortfolioStatusView />} />
            </Routes>
          </MemoryRouter>
        </CurrencyProvider>
      </QueryClientProvider>
    );

    const refreshButton = screen.getByRole('button', { name: /refresh portfolio/i });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledTimes(3);
    });
  });

  it('renders dashes when prices not yet loaded', () => {
    // No live prices → computePricedStatus returns null price fields → dashes
    vi.mocked(useLivePrices).mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
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

    renderComponent(1);

    // Null monetary values (market value, dividends, tax, after-tax) render as '-'
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('displays EUR values in stat cards when currency is EUR', () => {
    localStorage.setItem('pt_currency', 'EUR');

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: mockStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: mockLivePrices.data,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
    } as unknown as ReturnType<typeof useLivePrices>);

    renderComponent(1);

    // EUR principal = 7360, formatted as €7,360.00
    expect(screen.getByText('€7,360.00')).toBeInTheDocument();

    localStorage.removeItem('pt_currency');
  });
});

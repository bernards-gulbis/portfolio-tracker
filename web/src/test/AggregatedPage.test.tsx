import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AggregatedPage } from '../components/AggregatedPage';
import type { Portfolio, PortfolioStatus } from '../api';

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
}));

vi.mock('../hooks/useAggregatedStatus', () => ({
  useAggregatedStatus: vi.fn(),
}));

vi.mock('../hooks/useAggregatedPerformance', () => ({
  useAggregatedPerformance: vi.fn(),
}));

import { usePortfolios } from '../hooks/usePortfolios';
import { useAggregatedStatus } from '../hooks/useAggregatedStatus';
import { useAggregatedPerformance } from '../hooks/useAggregatedPerformance';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockPortfolios: Portfolio[] = [
  { id: 1, name: 'Growth Fund', created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Dividend Portfolio', created_at: '2024-02-01T00:00:00' },
];

const mockAggregatedStatus: PortfolioStatus = {
  portfolio_id: 0,
  portfolio_name: 'Aggregated',
  current_value: 15000,
  current_value_eur: 13800,
  principal: 12000,
  principal_eur: 11040,
  dividends: 0,
  dividends_eur: null,
  cash: 1000,
  holdings: [],
  holdings_cost: 0,
  holdings_value: 0,
  unrealized_gains: 0,
  unrealized_gains_pct: null,
  unrealized_gains_eur: null,
  realized_gains: 0,
  currency_gains_eur: null,
  currency_gains_pct: null,
  capital_gains_eur: null,
  capital_gains_tax_rate: 0.255,
  tax_eur: null,
  total_return_after_tax_eur: null,
  total_return_after_tax_pct: null,
  current_value_after_tax_eur: null,
  missing_prices: [],
};

const renderPage = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AggregatedPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AggregatedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    vi.mocked(useAggregatedStatus).mockReturnValue({
      data: mockAggregatedStatus,
      isLoading: false,
      error: null,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof useAggregatedStatus>);

    vi.mocked(useAggregatedPerformance).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useAggregatedPerformance>);
  });

  it('renders the page title', () => {
    renderPage();
    expect(screen.getByText('Aggregated Portfolio')).toBeInTheDocument();
  });

  it('shows portfolio checkboxes', () => {
    renderPage();
    expect(screen.getByText('Growth Fund')).toBeInTheDocument();
    expect(screen.getByText('Dividend Portfolio')).toBeInTheDocument();
  });

  it('shows select all and deselect all buttons', () => {
    renderPage();
    expect(screen.getByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  it('deselect all shows no-selection message', async () => {
    renderPage();

    // Click Deselect All
    await userEvent.click(screen.getByText('Deselect All'));

    expect(screen.getByText('Select at least one portfolio to view aggregated data.')).toBeInTheDocument();
  });

  it('shows loading skeleton when portfolios are loading', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderPage();
    expect(screen.getByText('Aggregated Portfolio')).toBeInTheDocument();
  });

  it('renders combined summary title when status is loaded', () => {
    renderPage();
    expect(screen.getByText('Combined Summary')).toBeInTheDocument();
  });

  it('shows error message on API failure', () => {
    vi.mocked(useAggregatedStatus).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Server error'),
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof useAggregatedStatus>);

    renderPage();
    expect(screen.getByText(/Server error/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PortfolioList from '../components/PortfolioList';
import type { Portfolio } from '../api';
import { SidebarProvider } from '../components/ui/sidebar';

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
  useCreatePortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdatePortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCopyPortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock('../context/PortfolioContext', () => ({
  usePortfolioContext: vi.fn(),
}));

import { usePortfolios } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderComponent = () => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <PortfolioList />
      </SidebarProvider>
    </QueryClientProvider>
  );
};

const mockPortfolios: Portfolio[] = [
  { id: 1, name: 'Growth Fund', created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Dividend Portfolio', created_at: '2024-02-01T00:00:00' },
];

describe('PortfolioList', () => {
  const mockSetActivePortfolioId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePortfolioContext).mockReturnValue({
      activePortfolioId: null,
      setActivePortfolioId: mockSetActivePortfolioId,
    });
  });

  it('shows skeleton rows while loading', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error message on failure', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    expect(screen.getByText(/Error loading portfolios/)).toBeInTheDocument();
  });

  it('shows empty state when portfolios list is empty', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    expect(screen.getByText('No Portfolios Yet')).toBeInTheDocument();
  });

  it('renders portfolio names in the list', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    expect(screen.getByText('Growth Fund')).toBeInTheDocument();
    expect(screen.getByText('Dividend Portfolio')).toBeInTheDocument();
  });

  it('clicking "New" button opens CreatePortfolioModal', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /New/i }));

    await waitFor(() => {
      expect(screen.getByText('Create New Portfolio')).toBeInTheDocument();
    });
  });

  it('clicking a row calls setActivePortfolioId', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    await userEvent.click(screen.getByText('Growth Fund'));

    expect(mockSetActivePortfolioId).toHaveBeenCalledWith(1);
  });
});

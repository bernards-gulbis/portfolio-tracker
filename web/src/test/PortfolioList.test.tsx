import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PortfolioList from '../components/PortfolioList';
import type { Portfolio } from '../api';
import { SidebarProvider } from '../components/ui/sidebar';

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
  useCreatePortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdatePortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useCopyPortfolio: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { usePortfolios } from '../hooks/usePortfolios';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderComponent = (initialEntries: string[] = ['/']) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/" element={<SidebarProvider><PortfolioList /></SidebarProvider>} />
          <Route path="/portfolios/:id" element={<SidebarProvider><PortfolioList /></SidebarProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const mockPortfolios: Portfolio[] = [
  { id: 1, name: 'Growth Fund', created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Dividend Portfolio', created_at: '2024-02-01T00:00:00' },
];

describe('PortfolioList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('shows empty state message when portfolios list is empty', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    expect(screen.getByText('Get started by creating your first portfolio.')).toBeInTheDocument();
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

  it('portfolio items are links to /portfolios/:id', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const growthLink = screen.getByText('Growth Fund').closest('a');
    expect(growthLink).toHaveAttribute('href', '/portfolios/1');

    const dividendLink = screen.getByText('Dividend Portfolio').closest('a');
    expect(dividendLink).toHaveAttribute('href', '/portfolios/2');
  });

  it('highlights the active portfolio based on URL', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent(['/portfolios/2']);

    const activeItem = screen.getByText('Dividend Portfolio').closest('[data-active]');
    expect(activeItem).toHaveAttribute('data-active', 'true');
  });

});

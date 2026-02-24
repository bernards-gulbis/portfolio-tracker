import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppBreadcrumbs } from '../components/AppBreadcrumbs';
import type { Portfolio } from '../api';

vi.mock('../hooks/usePortfolios', () => ({
  usePortfolios: vi.fn(),
}));

import { usePortfolios } from '../hooks/usePortfolios';

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

const renderBreadcrumbs = (initialEntry: string) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<AppBreadcrumbs />} />
          <Route path="/portfolios/:id" element={<AppBreadcrumbs />} />
          <Route path="/settings/*" element={<AppBreadcrumbs />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('AppBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);
  });

  it('renders "Portfolios" as current page at root path', () => {
    renderBreadcrumbs('/');

    expect(screen.getByText('Portfolios')).toBeInTheDocument();
    // Should not be a link at root
    expect(screen.getByText('Portfolios').closest('a')).toBeNull();
  });

  it('renders "Settings" as current page at /settings', () => {
    renderBreadcrumbs('/settings');

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Settings').closest('a')).toBeNull();
  });

  it('renders "Settings" for settings sub-routes', () => {
    renderBreadcrumbs('/settings/profile');

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders two breadcrumb segments for portfolio detail', () => {
    renderBreadcrumbs('/portfolios/1');

    // "Portfolios" as a link
    const portfoliosLink = screen.getByText('Portfolios').closest('a');
    expect(portfoliosLink).toHaveAttribute('href', '/');

    // Portfolio name as current page
    expect(screen.getByText('Growth Fund')).toBeInTheDocument();
  });

  it('shows portfolio name from data', () => {
    renderBreadcrumbs('/portfolios/2');

    expect(screen.getByText('Dividend Portfolio')).toBeInTheDocument();
  });

  it('falls back to #id when portfolio not found in data', () => {
    renderBreadcrumbs('/portfolios/999');

    expect(screen.getByText('#999')).toBeInTheDocument();
  });

  it('falls back to #id when data is undefined (loading)', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderBreadcrumbs('/portfolios/3');

    expect(screen.getByText('#3')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PortfolioSwitcher } from '../components/PortfolioSwitcher';
import type { Portfolio } from '../api';

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

const mockOnCreateClick = vi.fn();

const renderComponent = (activePortfolioId: number | null = null) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PortfolioSwitcher activePortfolioId={activePortfolioId} onCreateClick={mockOnCreateClick} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const mockPortfolios: Portfolio[] = [
  { id: 1, name: 'Growth Fund', created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Dividend Portfolio', created_at: '2024-02-01T00:00:00' },
];

describe('PortfolioSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton while loading', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows "Portfolios" when no portfolio is active', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    expect(screen.getByText('Portfolios')).toBeInTheDocument();
  });

  it('shows active portfolio name when activePortfolioId is set', () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent(2);

    expect(screen.getByText('Dividend Portfolio')).toBeInTheDocument();
  });

  it('shows portfolio list in dropdown when clicked', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    expect(screen.getByText('Growth Fund')).toBeInTheDocument();
    expect(screen.getByText('Dividend Portfolio')).toBeInTheDocument();
  });

  it('shows error message when portfolios fail to load', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    expect(screen.getByText(/Error loading portfolios/)).toBeInTheDocument();
  });

  it('shows empty state when no portfolios exist', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    expect(screen.getByText('No portfolios yet. Create one below.')).toBeInTheDocument();
  });

  it('shows "New Portfolio" button in dropdown', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    expect(screen.getByText('New Portfolio')).toBeInTheDocument();
  });

  it('calls onCreateClick when "New Portfolio" is clicked', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    const newButton = screen.getByText('New Portfolio');
    await userEvent.click(newButton);

    expect(mockOnCreateClick).toHaveBeenCalledOnce();
  });

  it('portfolio items are links to /portfolios/:id', async () => {
    vi.mocked(usePortfolios).mockReturnValue({
      data: mockPortfolios,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePortfolios>);

    renderComponent();

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);

    const growthLink = screen.getByText('Growth Fund').closest('a');
    expect(growthLink).toHaveAttribute('href', '/portfolios/1');

    const dividendLink = screen.getByText('Dividend Portfolio').closest('a');
    expect(dividendLink).toHaveAttribute('href', '/portfolios/2');
  });
});

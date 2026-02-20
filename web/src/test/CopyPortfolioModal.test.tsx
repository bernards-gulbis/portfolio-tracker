import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CopyPortfolioModal from '../components/CopyPortfolioModal';

vi.mock('../hooks/usePortfolios', () => ({
  useCopyPortfolio: vi.fn(),
}));

import { useCopyPortfolio } from '../hooks/usePortfolios';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  portfolioId: 1,
  portfolioName: 'My Portfolio',
};

const renderModal = (props = defaultProps) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CopyPortfolioModal {...props} />
    </QueryClientProvider>
  );
};

describe('CopyPortfolioModal', () => {
  const mockMutateAsync = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCopyPortfolio).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCopyPortfolio>);
    defaultProps.onClose = mockOnClose;
  });

  it('pre-fills input with "${portfolioName} (Copy)"', () => {
    renderModal();

    const input = screen.getByLabelText('New Portfolio Name') as HTMLInputElement;
    expect(input.value).toBe('My Portfolio (Copy)');
  });

  it('calls copyPortfolio with trimmed name on submit', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 2, name: 'My Portfolio (Copy)', created_at: '' });
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Copy Portfolio' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        portfolioId: 1,
        newName: 'My Portfolio (Copy)',
      });
    });
  });

  it('shows API error on failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Copy failed'));
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Copy Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Copy failed')).toBeInTheDocument();
    });
  });

  it('shows validation error for empty name', async () => {
    renderModal();

    const input = screen.getByLabelText('New Portfolio Name');
    await userEvent.clear(input);

    await userEvent.click(screen.getByRole('button', { name: 'Copy Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

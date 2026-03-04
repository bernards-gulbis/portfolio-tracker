import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CreatePortfolioModal } from '../components/CreatePortfolioModal';

// Mock the hook
vi.mock('../hooks/usePortfolios', () => ({
  useCreatePortfolio: vi.fn(),
}));

import { useCreatePortfolio } from '../hooks/usePortfolios';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreatePortfolioModal {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('CreatePortfolioModal', () => {
  const mockOnClose = vi.fn();
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreatePortfolio).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreatePortfolio>);
  });

  it('renders with "Create New Portfolio" title when open', () => {
    renderModal({ isOpen: true, onClose: mockOnClose });

    expect(screen.getByText('Create New Portfolio')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    renderModal({ isOpen: false, onClose: mockOnClose });

    expect(screen.queryByText('Create New Portfolio')).not.toBeInTheDocument();
  });

  it('calls mutateAsync with trimmed name on valid submit', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 1, name: 'My Portfolio', created_at: '' });
    renderModal({ isOpen: true, onClose: mockOnClose });

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.type(input, '  My Portfolio  ');

    await userEvent.click(screen.getByRole('button', { name: 'Create Portfolio' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ name: 'My Portfolio' });
    });
  });

  it('shows validation error for empty name', async () => {
    renderModal({ isOpen: true, onClose: mockOnClose });

    await userEvent.click(screen.getByRole('button', { name: 'Create Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error for whitespace-only name', async () => {
    renderModal({ isOpen: true, onClose: mockOnClose });

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.type(input, '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Create Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error for name exceeding 255 characters', async () => {
    renderModal({ isOpen: true, onClose: mockOnClose });

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.type(input, 'a'.repeat(256));

    await userEvent.click(screen.getByRole('button', { name: 'Create Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Name must be at most 255 characters')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows API error returned from mutation', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Portfolio already exists'));
    renderModal({ isOpen: true, onClose: mockOnClose });

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.type(input, 'My Portfolio');

    await userEvent.click(screen.getByRole('button', { name: 'Create Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio already exists')).toBeInTheDocument();
    });
  });

  it('close button calls onClose', async () => {
    renderModal({ isOpen: true, onClose: mockOnClose });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockOnClose).toHaveBeenCalled();
  });
});

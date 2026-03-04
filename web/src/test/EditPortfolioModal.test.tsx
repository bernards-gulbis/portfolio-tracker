import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditPortfolioModal } from '../components/EditPortfolioModal';

vi.mock('../hooks/usePortfolios', () => ({
  useUpdatePortfolio: vi.fn(),
}));

import { useUpdatePortfolio } from '../hooks/usePortfolios';

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
  currentName: 'My Portfolio',
};

const renderModal = (props = defaultProps) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EditPortfolioModal {...props} />
    </QueryClientProvider>
  );
};

describe('EditPortfolioModal', () => {
  const mockMutateAsync = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUpdatePortfolio).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdatePortfolio>);
    defaultProps.onClose = mockOnClose;
  });

  it('pre-fills input with currentName', () => {
    renderModal();

    const input = screen.getByLabelText('Portfolio Name') as HTMLInputElement;
    expect(input.value).toBe('My Portfolio');
  });

  it('calls onClose without API call when name is unchanged', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('calls updatePortfolio when name is changed', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 1, name: 'Renamed', created_at: '' });
    renderModal();

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed Portfolio');

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        portfolioId: 1,
        data: { name: 'Renamed Portfolio' },
      });
    });
  });

  it('shows validation error for empty name', async () => {
    renderModal();

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.clear(input);

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error for whitespace-only name', async () => {
    renderModal();

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.clear(input);
    await userEvent.type(input, '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Portfolio name is required')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows validation error for name exceeding 255 characters', async () => {
    renderModal();

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.clear(input);
    // Use fireEvent to set a long value instantly (userEvent.type is too slow for 256 chars)
    fireEvent.change(input, { target: { value: 'a'.repeat(256) } });

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Name must be at most 255 characters')).toBeInTheDocument();
    });
  });

  it('shows API error from mutation', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Server error'));
    renderModal();

    const input = screen.getByLabelText('Portfolio Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'New Name');

    await userEvent.click(screen.getByRole('button', { name: 'Update Portfolio' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });
});

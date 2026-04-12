import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortfolioActions } from '../components/PortfolioActions';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { toast } from 'sonner';

const mockNavigation = {
  page: 'portfolio' as const,
  activePortfolioId: 1 as number | null,
  goToPortfolio: vi.fn(),
  goToFirstPortfolio: vi.fn(),
  goToTransactions: vi.fn(),
  goToSettings: vi.fn(),
};

vi.mock('../context/NavigationContext', () => ({
  useNavigation: () => mockNavigation,
}));

vi.mock('../hooks/usePortfolios', () => ({
  useDeletePortfolio: vi.fn(),
  useCopyPortfolio: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePortfolio: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePortfolio: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return { ...actual, getErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e) };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderActions = (props = { portfolioId: 1, portfolioName: 'My Portfolio' }) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PortfolioActions {...props} />
    </QueryClientProvider>
  );
};

describe('PortfolioActions', () => {
  const mockDeleteMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDeletePortfolio).mockReturnValue({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useDeletePortfolio>);
  });

  it('renders the actions dropdown trigger', () => {
    renderActions();
    expect(screen.getByRole('button', { name: /actions for my portfolio/i })).toBeInTheDocument();
  });

  it('shows Rename, Copy, and Delete options', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));

    expect(await screen.findByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('opens edit modal when Rename is clicked', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Rename'));

    expect(await screen.findByText('Rename Portfolio')).toBeInTheDocument();
  });

  it('opens copy modal when Copy is clicked', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Copy'));

    // Dialog should be open — look for the input field unique to copy modal
    expect(await screen.findByLabelText('New Portfolio Name')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));

    // The dropdown closes on click in radix, so need to find Delete via the menu
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    await user.click(deleteItem);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/permanently delete/i)).toBeInTheDocument();
  });

  it('calls deletePortfolio when confirmed', { timeout: 15000 }, async () => {
    mockDeleteMutateAsync.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith(1);
    });
  });

  it('closes edit modal when onClose is called', async () => {
    const user = userEvent.setup();
    renderActions();

    // Open modal
    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Rename'));
    expect(await screen.findByText('Rename Portfolio')).toBeInTheDocument();

    // Close via the dialog close button (X)
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Rename Portfolio')).not.toBeInTheDocument();
    });
  });

  it('closes copy modal when onClose is called', async () => {
    const user = userEvent.setup();
    renderActions();

    // Open modal
    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Copy'));
    expect(await screen.findByLabelText('New Portfolio Name')).toBeInTheDocument();

    // Close via dialog close button
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByLabelText('New Portfolio Name')).not.toBeInTheDocument();
    });
  });

  it('shows error toast when delete fails', { timeout: 15000 }, async () => {
    mockDeleteMutateAsync.mockRejectedValueOnce(new Error('Cannot delete'));
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /actions for my portfolio/i }));
    await user.click(await screen.findByText('Delete'));

    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Cannot delete'));
    });
  });
});

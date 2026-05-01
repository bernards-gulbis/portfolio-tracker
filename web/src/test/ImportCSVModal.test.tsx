import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportCSVModal } from '../components/ImportCSVModal';

vi.mock('../hooks/useTransactions', () => ({
  useImportTransactionsCSV: vi.fn(),
}));

import { useImportTransactionsCSV } from '../hooks/useTransactions';

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
};

const renderModal = (props = defaultProps) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportCSVModal {...props} />
    </QueryClientProvider>
  );
};

// Helper: set file on a file input using Object.defineProperty (jsdom workaround)
const setFileOnInput = (input: HTMLElement, file: File) => {
  Object.defineProperty(input, 'files', {
    value: { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) },
    configurable: true,
  });
  fireEvent.change(input, { target: { files: { 0: file, length: 1 } } });
};

describe('ImportCSVModal', () => {
  const mockMutateAsync = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useImportTransactionsCSV).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useImportTransactionsCSV>);
    defaultProps.onClose = mockOnClose;
  });

  it('renders file input with .csv accept attribute', () => {
    renderModal();

    const input = screen.getByLabelText('CSV File') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toBe('.csv');
  });

  it('shows validation error when no file is selected', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByText('Please select a file')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('Preview triggers a dry-run and shows the projected counts', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      imported_count: 5,
      skipped_count: 2,
      transactions: [],
      dry_run: true,
    });
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['date,type\n2024-01-01,Deposit'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      portfolioId: 1,
      file: expect.any(File),
      dryRun: true,
    }));

    // Step 2 of the wizard is now visible.
    await waitFor(() => {
      expect(screen.getByText(/5 new transactions will be added/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 duplicate rows will be skipped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('Confirm import on the preview step runs the real (non-dry-run) import', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      imported_count: 3,
      skipped_count: 0,
      transactions: [],
      dry_run: true,
    });
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['date,type\n2024-01-01,Deposit'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => screen.getByRole('button', { name: 'Confirm import' }));

    mockMutateAsync.mockResolvedValueOnce({
      imported_count: 3,
      skipped_count: 0,
      transactions: [],
      dry_run: false,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    await waitFor(() => {
      // Two calls total: dry-run, then real import without ``dryRun`` set.
      expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      expect(mockMutateAsync).toHaveBeenLastCalledWith({
        portfolioId: 1,
        file: expect.any(File),
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('Back from preview step returns to file selection', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      imported_count: 1,
      skipped_count: 0,
      transactions: [],
      dry_run: true,
    });
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['date,type\n2024-01-01,Deposit'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    // Back to step 1: Preview button visible again, Confirm import gone.
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('shows API error on dry-run failure and stays on step 1', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Invalid CSV format'));
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['bad data'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid CSV format')).toBeInTheDocument();
    });
    // Did not advance to step 2.
    expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
  });

  it('shows validation error when file is not a .csv', async () => {
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['data'], 'data.txt', { type: 'text/plain' });
    setFileOnInput(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(screen.getByText('Please select a CSV file')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});

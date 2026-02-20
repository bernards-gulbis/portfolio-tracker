import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ImportCSVModal from '../components/UploadCSVModal';

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

describe('UploadCSVModal', () => {
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

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(screen.getByText('Please select a file')).toBeInTheDocument();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows imported count success message after successful import', async () => {
    mockMutateAsync.mockResolvedValueOnce({ imported_count: 5, transactions: [] });
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['date,type\n2024-01-01,Deposit'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(screen.getByText('Successfully imported 5 transactions!')).toBeInTheDocument();
    });
  });

  it('shows API error on import failure', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('Invalid CSV format'));
    renderModal();

    const input = screen.getByLabelText('CSV File');
    const file = new File(['bad data'], 'data.csv', { type: 'text/csv' });
    setFileOnInput(input, file);

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid CSV format')).toBeInTheDocument();
    });
  });
});

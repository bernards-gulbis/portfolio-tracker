import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionModal from '../components/TransactionModal';
import { Holding, TransactionType, Transaction } from '../api';

// Radix Select uses APIs not available in jsdom
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('../hooks/useTransactions', () => ({
  useCreateTransaction: vi.fn(),
  useUpdateTransaction: vi.fn(),
}));

vi.mock('../hooks/usePortfolioStatus', () => ({
  usePortfolioStatus: vi.fn(),
}));

vi.mock('../hooks/useLivePrices', () => ({
  useLivePrices: vi.fn(),
}));

import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { useLivePrices } from '../hooks/useLivePrices';

const mockHoldings: Holding[] = [
  {
    ticker: 'AAPL',
    quantity: 10,
    average_cost: 150,
    total_cost: 1500,
  },
  {
    ticker: 'MSFT',
    quantity: 5,
    average_cost: 300,
    total_cost: 1500,
  },
];

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

const renderModal = (props: { isOpen: boolean; onClose: () => void; portfolioId: number; transaction?: Transaction } = defaultProps) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionModal {...props} />
    </QueryClientProvider>
  );
};

/** Select a transaction type from the Type dropdown */
const selectType = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const trigger = screen.getByRole('combobox', { name: 'Transaction Type' });
  await user.click(trigger);
  const option = await screen.findByRole('option', { name: label });
  await user.click(option);
};

describe('TransactionModal — sell suggestions', () => {
  const mockCreateMutateAsync = vi.fn();
  const mockUpdateMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useCreateTransaction).mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateTransaction>);

    vi.mocked(useUpdateTransaction).mockReturnValue({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateTransaction>);

    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: { holdings: mockHoldings, usd_to_eur_rate: 0.92 },
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    vi.mocked(useLivePrices).mockReturnValue({
      data: { prices: { AAPL: 175.50, MSFT: 420.00 }, usd_to_eur_rate: 0.92, timestamp: '' },
    } as unknown as ReturnType<typeof useLivePrices>);
  });

  it('renders Select dropdown for ticker when type is SELL', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    // The ticker field should be a combobox (Select) not a textbox (Input)
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    expect(tickerSelect).toBeInTheDocument();
  });

  it('renders text Input for ticker when type is BUY', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    const tickerInput = screen.getByRole('textbox', { name: 'Asset' });
    expect(tickerInput).toBeInTheDocument();
  });

  it('populates Select options with holdings', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    expect(await screen.findByRole('option', { name: 'AAPL (10 shares)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MSFT (5 shares)' })).toBeInTheDocument();
  });

  it('auto-fills price when a holding ticker is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    const aaplOption = await screen.findByRole('option', { name: 'AAPL (10 shares)' });
    await user.click(aaplOption);

    const priceInput = screen.getByLabelText('Price per Share') as HTMLInputElement;
    expect(priceInput.value).toBe('175.50');
  });

  it('shows "Sell All" button that fills quantity when a holding is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    // Select AAPL
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);
    const aaplOption = await screen.findByRole('option', { name: 'AAPL (10 shares)' });
    await user.click(aaplOption);

    const sellAllBtn = screen.getByRole('button', { name: 'Sell All' });
    expect(sellAllBtn).toBeInTheDocument();

    await user.click(sellAllBtn);

    const quantityInput = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantityInput.value).toBe('10');
  });

  it('shows available quantity description when a holding is selected', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);
    const msftOption = await screen.findByRole('option', { name: 'MSFT (5 shares)' });
    await user.click(msftOption);

    expect(screen.getByText('Available: 5 shares')).toBeInTheDocument();
  });

  it('shows disabled message when holdings are empty', async () => {
    vi.mocked(usePortfolioStatus).mockReturnValue({
      data: { holdings: [] },
    } as unknown as ReturnType<typeof usePortfolioStatus>);

    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    const matches = await screen.findAllByText('No holdings available');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows fallback option in edit mode when ticker is not in current holdings', async () => {
    const editTransaction: Transaction = {
      id: 99,
      portfolio_id: 1,
      date: '2024-01-15T10:00:00',
      type: TransactionType.SELL,
      ticker: 'GOOG',
      quantity: 3,
      price_per_share: 140.0,
      fee: 1.0,
      total_amount: 419.0,
      eur_amount: null,
      split_ratio: null,
    };

    const user = userEvent.setup();
    renderModal({ ...defaultProps, transaction: editTransaction });

    // In edit mode for a SELL, the ticker dropdown should be shown
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    // Should have GOOG as a fallback option even though it's not in holdings
    expect(await screen.findByRole('option', { name: 'GOOG' })).toBeInTheDocument();
    // Plus the regular holdings
    expect(screen.getByRole('option', { name: 'AAPL (10 shares)' })).toBeInTheDocument();
  });

  it('auto-calculates totalAmount from quantity, price and fee', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Sell');

    // Select AAPL (auto-fills price to 175.50)
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);
    const aaplOption = await screen.findByRole('option', { name: 'AAPL (10 shares)' });
    await user.click(aaplOption);

    // Click Sell All (fills quantity to 10)
    await user.click(screen.getByRole('button', { name: 'Sell All' }));

    // totalAmount should be auto-calculated: 10 * 175.50 + 0 = 1755.00
    await waitFor(() => {
      const totalInput = screen.getByLabelText('Total Amount') as HTMLInputElement;
      expect(totalInput.value).toBe('1755.00');
    });
  });

  it('shows ticker combobox with holdings for Dividend type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    expect(await screen.findByRole('option', { name: 'AAPL (10 shares)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MSFT (5 shares)' })).toBeInTheDocument();
  });

  it('allows typing a custom ticker for Dividend type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');

    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);

    // Type a ticker not in holdings
    const searchInput = screen.getByPlaceholderText('Select holding...');
    await user.type(searchInput, 'GOOG');

    // Custom option should appear
    const customOption = await screen.findByRole('option', { name: 'GOOG' });
    await user.click(customOption);

    // The combobox trigger should now show GOOG
    expect(screen.getByRole('combobox', { name: 'Asset' })).toHaveTextContent('GOOG');
  });

  it('auto-fills FX rate with usd_to_eur_rate for Dividend type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');

    await waitFor(() => {
      const fxInput = screen.getByLabelText('FX Rate') as HTMLInputElement;
      expect(fxInput.value).toBe('0.9200');
    });
  });
});

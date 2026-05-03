import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransactionModal } from '../components/TransactionModal';
import { Holding, TransactionType, Transaction } from '../api';

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
    first_buy_date: '2024-01-01',
  },
  {
    ticker: 'MSFT',
    quantity: 5,
    average_cost: 300,
    total_cost: 1500,
    first_buy_date: '2024-01-01',
  },
];

/** Default live-prices mock — realistic ISO timestamps so new Date(as_of) is valid. */
const buildLivePricesMock = () => ({
  data: {
    prices: {
      AAPL: { price: 175.5, source: 'live' as const, as_of: '2024-01-01T00:00:00Z' },
      MSFT: { price: 420.0, source: 'live' as const, as_of: '2024-01-01T00:00:00Z' },
    },
    usd_to_eur_rate: 0.92,
    timestamp: '2024-01-01T00:00:00Z',
  },
});

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

/** Toggle the Advanced section open or closed. */
const expandAdvanced = async (user: ReturnType<typeof userEvent.setup>) => {
  const trigger = screen.getByRole('button', { name: 'Advanced' });
  await user.click(trigger);
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

    vi.mocked(useLivePrices).mockReturnValue(
      buildLivePricesMock() as unknown as ReturnType<typeof useLivePrices>,
    );
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

  it('auto-fills FX rate with USD-per-EUR (inverse of usd_to_eur_rate) for Dividend type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');
    await expandAdvanced(user);

    // Backend stores fx_rate as USD per EUR (computes EUR via total / fx_rate),
    // while usd_to_eur_rate (0.92) is EUR per USD. We invert at the UI boundary,
    // so the auto-filled value is 1/0.92 ≈ 1.0870, not 0.9200. A regression here
    // would inflate every saved EUR equivalent by ~17% (the old bug).
    await waitFor(() => {
      const fxInput = screen.getByLabelText('FX Rate') as HTMLInputElement;
      expect(fxInput.value).toBe('1.0870');
    });
  });
});

describe('TransactionModal — edit mode', () => {
  const mockCreateMutateAsync = vi.fn();
  const mockUpdateMutateAsync = vi.fn();

  const editTransaction: Transaction = {
    id: 42,
    portfolio_id: 1,
    date: '2024-06-15T14:30:00',
    type: TransactionType.BUY,
    ticker: 'AAPL',
    quantity: 10,
    price_per_share: 150.00,
    fee: 5.00,
    total_amount: -1505.00,
    eur_amount: null,
    split_ratio: null,
  };

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

    vi.mocked(useLivePrices).mockReturnValue(
      buildLivePricesMock() as unknown as ReturnType<typeof useLivePrices>,
    );
  });

  it('shows edit title when transaction is provided', () => {
    renderModal({ ...defaultProps, transaction: editTransaction });
    expect(screen.getByText('Edit Transaction')).toBeInTheDocument();
  });

  it('shows add title when no transaction', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: 'Add Transaction' })).toBeInTheDocument();
  });

  it('pre-fills form fields in edit mode', () => {
    renderModal({ ...defaultProps, transaction: editTransaction });

    const tickerInput = screen.getByLabelText('Asset') as HTMLInputElement;
    expect(tickerInput.value).toBe('AAPL');

    const quantityInput = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(quantityInput.value).toBe('10');

    const priceInput = screen.getByLabelText('Price per Share') as HTMLInputElement;
    expect(priceInput.value).toBe('150.00');
  });

  it('calls updateTransaction on submit in edit mode', async () => {
    mockUpdateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal({ ...defaultProps, transaction: editTransaction });

    const submitBtn = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 42,
          portfolioId: 1,
        })
      );
    });
  });

  it('shows Split Ratio field for Split type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Split');

    expect(screen.getByLabelText('Split Ratio')).toBeInTheDocument();
    expect(screen.queryByLabelText('Total Amount')).not.toBeInTheDocument();
  });

  it('shows EUR amount field for Withdraw type', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Withdraw');

    expect(screen.getByLabelText('Amount in EUR')).toBeInTheDocument();
  });

  it('shows EUR amount field for Deposit type (default)', () => {
    renderModal();
    expect(screen.getByLabelText('Amount in EUR')).toBeInTheDocument();
  });

  it('shows validation error when total amount is empty', async () => {
    const user = userEvent.setup();
    renderModal();

    // Submit without filling total amount (required for Deposit)
    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Total amount must be greater than 0')).toBeInTheDocument();
    });
  });
});

describe('TransactionModal — validation & create', () => {
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

    vi.mocked(useLivePrices).mockReturnValue(
      buildLivePricesMock() as unknown as ReturnType<typeof useLivePrices>,
    );
  });

  it('shows ticker required error for BUY with empty ticker', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/asset symbol is required/i)).toBeInTheDocument();
    });
  });

  it('shows quantity error for BUY with quantity 0', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    const tickerInput = screen.getByRole('textbox', { name: 'Asset' });
    await user.type(tickerInput, 'AAPL');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/quantity must be/i)).toBeInTheDocument();
    });
  });

  it('shows split ratio error for SPLIT with empty ratio', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Split');

    // Fill ticker (required for SPLIT)
    const tickerInput = screen.getByRole('textbox', { name: 'Asset' });
    await user.type(tickerInput, 'AAPL');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/split ratio must be/i)).toBeInTheDocument();
    });
  });

  it('shows total amount error for DIVIDEND with empty total', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');

    // Select a ticker via combobox
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);
    const aaplOption = await screen.findByRole('option', { name: 'AAPL (10 shares)' });
    await user.click(aaplOption);

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/total amount must be/i)).toBeInTheDocument();
    });
  });

  it('calls createTransaction with correct data for DEPOSIT', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    // Default type is DEPOSIT
    const totalInput = screen.getByLabelText('Total Amount');
    await user.type(totalInput, '5000');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioId: 1,
          data: expect.objectContaining({
            type: 'Deposit',
            total_amount: 5000,
          }),
        })
      );
    });
  });

  it('shows root error alert when mutation rejects', async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(new Error('Server error'));
    const user = userEvent.setup();
    renderModal();

    const totalInput = screen.getByLabelText('Total Amount');
    await user.type(totalInput, '5000');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('sends negative total_amount for WITHDRAW', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Withdraw');

    const totalInput = screen.getByLabelText('Total Amount');
    await user.type(totalInput, '2000');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'Withdraw',
            total_amount: -2000,
          }),
        })
      );
    });
  });

  it('auto-calculates EUR field for DEPOSIT from usd_to_eur_rate', async () => {
    const user = userEvent.setup();
    renderModal();

    // DEPOSIT is default type. usd_to_eur_rate is 0.92
    const totalInput = screen.getByLabelText('Total Amount');
    await user.type(totalInput, '1000');

    await waitFor(() => {
      const eurInput = screen.getByLabelText('Amount in EUR') as HTMLInputElement;
      expect(eurInput.value).toBe('920.00');
    });
  });

  it('allows typing custom ticker in BUY mode', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    const tickerInput = screen.getByRole('textbox', { name: 'Asset' }) as HTMLInputElement;
    await user.type(tickerInput, 'NVDA');

    expect(tickerInput.value).toBe('NVDA');
  });

  it('includes fee and fxRate in DIVIDEND submission data', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Dividend');

    // Select AAPL ticker
    const tickerSelect = screen.getByRole('combobox', { name: 'Asset' });
    await user.click(tickerSelect);
    const aaplOption = await screen.findByRole('option', { name: 'AAPL (10 shares)' });
    await user.click(aaplOption);

    // Fill total amount
    const totalInput = screen.getByLabelText('Total Amount');
    await user.type(totalInput, '50');

    // Open Advanced to access the Fee input
    await expandAdvanced(user);
    const feeInput = screen.getByLabelText('Fee');
    await user.clear(feeInput);
    await user.type(feeInput, '2.50');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'Dividend',
            ticker: 'AAPL',
            total_amount: 50,
            fee: 2.5,
            // Auto-filled fxRate is "1.0870" (= 1 / 0.92, USD per EUR);
            // parseFloat drops the trailing zero.
            fx_rate: 1.087,
          }),
        })
      );
    });
  });

  it.each([
    'Deposit',
    'Withdraw',
    'Buy',
    'Sell',
    'Fee',
    'Dividend',
    'Split',
  ])('shows FX Rate field for %s (inside Advanced)', async (typeLabel) => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, typeLabel);
    await expandAdvanced(user);

    await waitFor(() => {
      expect(screen.getByLabelText('FX Rate')).toBeInTheDocument();
    });
  });

  it('sends fx_rate for BUY (auto-filled, no EUR plumbing on backend yet)', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    const tickerInput = screen.getByRole('textbox', { name: 'Asset' });
    await user.type(tickerInput, 'AAPL');

    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.type(screen.getByLabelText('Price per Share'), '150');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'Buy',
            fx_rate: 1.087,
          }),
        }),
      );
    });
  });

  it('sends fx_rate for FEE', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Fee');
    await user.type(screen.getByLabelText('Total Amount'), '12.50');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'Fee',
            total_amount: -12.5,
            fx_rate: 1.087,
          }),
        }),
      );
    });
  });

  it('sends fx_rate alongside eur_amount for DEPOSIT (backend cascade prefers eur_amount)', async () => {
    mockCreateMutateAsync.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderModal();

    // Deposit is the default type
    await user.type(screen.getByLabelText('Total Amount'), '1000');

    const submitBtn = screen.getByRole('button', { name: 'Save Transaction' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'Deposit',
            total_amount: 1000,
            // valueEur auto-derives from total * usd_to_eur_rate = 1000 * 0.92 = 920
            eur_amount: 920,
            fx_rate: 1.087,
          }),
        }),
      );
    });
  });

  it('leaves FX Rate empty when editing a transaction without fx_rate', () => {
    // Auto-fill must NOT substitute today's rate for an old transaction that was
    // saved with no FX rate — that would distort the historical record. The user
    // can manually fill the field via the (auto-expanded) Advanced section.
    const tx: Transaction = {
      id: 200,
      portfolio_id: 1,
      date: '2022-04-15T10:00:00',
      type: TransactionType.DEPOSIT,
      ticker: null,
      quantity: null,
      price_per_share: null,
      fee: null,
      total_amount: 1000,
      eur_amount: null,
      split_ratio: null,
      fx_rate: null,
    };
    renderModal({ ...defaultProps, transaction: tx });

    // Advanced is auto-expanded in edit mode, so the input is in the DOM —
    // it just must not be auto-filled.
    expect((screen.getByLabelText('FX Rate') as HTMLInputElement).value).toBe('');
  });

  it('auto-expands Advanced in edit mode so prior values are visible', () => {
    const tx: Transaction = {
      id: 100,
      portfolio_id: 1,
      date: '2024-06-15T14:30:00',
      type: TransactionType.BUY,
      ticker: 'AAPL',
      quantity: 10,
      price_per_share: 150,
      fee: 1,
      total_amount: -1501,
      eur_amount: null,
      split_ratio: null,
      fx_rate: 1.1234,
    };
    renderModal({ ...defaultProps, transaction: tx });

    // No user interaction needed: Advanced is open in edit mode.
    expect((screen.getByLabelText('FX Rate') as HTMLInputElement).value).toBe('1.1234');
    expect((screen.getByLabelText('Time') as HTMLInputElement).value).toBe('14:30:00');
    expect((screen.getByLabelText('Fee') as HTMLInputElement).value).toBe('1.00');
  });

  it('hides Time/Fee/FX Rate by default in add mode for a BUY', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    expect(screen.queryByLabelText('Time')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fee')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('FX Rate')).not.toBeInTheDocument();

    await expandAdvanced(user);

    expect(screen.getByLabelText('Time')).toBeInTheDocument();
    expect(screen.getByLabelText('Fee')).toBeInTheDocument();
    expect(screen.getByLabelText('FX Rate')).toBeInTheDocument();
  });

  it('re-fills FX rate with current rate when modal is reopened', async () => {
    // The modal stays mounted in TransactionView; only the `isOpen` prop toggles.
    // After ``reset()`` clears fxRate on each open, the auto-fill effect must re-fire
    // — otherwise the second open shows an empty FX Rate field.
    const user = userEvent.setup();
    const { rerender } = renderModal();

    await expandAdvanced(user);
    expect((screen.getByLabelText('FX Rate') as HTMLInputElement).value).toBe('1.0870');

    // Simulate close + reopen on the same mounted instance.
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <TransactionModal {...defaultProps} isOpen={false} />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <TransactionModal {...defaultProps} isOpen={true} />
      </QueryClientProvider>,
    );

    await expandAdvanced(user);
    await waitFor(() => {
      expect((screen.getByLabelText('FX Rate') as HTMLInputElement).value).toBe('1.0870');
    });
  });

  it('preserves user-typed totalAmount on BUY when fee changes', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');
    await user.type(screen.getByRole('textbox', { name: 'Asset' }), 'AAPL');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.type(screen.getByLabelText('Price per Share'), '150');

    // Auto-calc has set totalAmount to 1500. User overrides it.
    const totalInput = screen.getByLabelText('Total Amount') as HTMLInputElement;
    await waitFor(() => expect(Number.parseFloat(totalInput.value)).toBe(1500));
    await user.clear(totalInput);
    await user.type(totalInput, '1505');

    // Bump the fee inside Advanced. Auto-calc must NOT clobber 1505.
    await expandAdvanced(user);
    const feeInput = screen.getByLabelText('Fee');
    await user.clear(feeInput);
    await user.type(feeInput, '2');

    await new Promise((r) => setTimeout(r, 50));
    expect(Number.parseFloat(totalInput.value)).toBe(1505);
  });

  it('preserves user-typed valueEur on DEPOSIT when totalAmount changes', async () => {
    const user = userEvent.setup();
    renderModal();

    // Default type is DEPOSIT.
    const totalInput = screen.getByLabelText('Total Amount') as HTMLInputElement;
    await user.type(totalInput, '1000');
    const eurInput = screen.getByLabelText('Amount in EUR') as HTMLInputElement;
    await waitFor(() => expect(Number.parseFloat(eurInput.value)).toBe(920));

    // User overrides with the actual bank amount.
    await user.clear(eurInput);
    await user.type(eurInput, '918.50');

    // Append a digit to totalAmount; auto-derive must NOT clobber valueEur.
    await user.type(totalInput, '1');

    await new Promise((r) => setTimeout(r, 50));
    expect(Number.parseFloat(eurInput.value)).toBe(918.5);
  });

  it('resets user-edit flag on type change', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');
    await user.type(screen.getByRole('textbox', { name: 'Asset' }), 'AAPL');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.type(screen.getByLabelText('Price per Share'), '150');

    const totalInput = screen.getByLabelText('Total Amount') as HTMLInputElement;
    await waitFor(() => expect(Number.parseFloat(totalInput.value)).toBe(1500));
    await user.clear(totalInput);
    await user.type(totalInput, '1505');
    expect(Number.parseFloat(totalInput.value)).toBe(1505);

    // Switch to SELL; the flag resets and auto-calc takes over again.
    await selectType(user, 'Sell');
    await waitFor(() => {
      expect(
        Number.parseFloat(
          (screen.getByLabelText('Total Amount') as HTMLInputElement).value,
        ),
      ).toBe(1500);
    });
  });

  it('clears type-specific fields when switching from BUY to DEPOSIT and back', async () => {
    // Stale ticker / qty / price from a previous type must not leak when the
    // user switches to a type that doesn't display them, then back.
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');
    await user.type(screen.getByRole('textbox', { name: 'Asset' }), 'AAPL');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.type(screen.getByLabelText('Price per Share'), '150');

    await selectType(user, 'Deposit');
    // BUY-only fields are no longer in the DOM; verify the form state was
    // cleared by switching back to BUY and checking the inputs are empty.
    await selectType(user, 'Buy');

    expect((screen.getByRole('textbox', { name: 'Asset' }) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Price per Share') as HTMLInputElement).value).toBe('');
  });

  it('preserves totalAmount across type change when both types display it', async () => {
    const user = userEvent.setup();
    renderModal();

    // Default DEPOSIT.
    await user.type(screen.getByLabelText('Total Amount'), '1000');

    await selectType(user, 'Withdraw');

    // WITHDRAW also shows totalAmount; user's value should survive.
    expect(
      Number.parseFloat(
        (screen.getByLabelText('Total Amount') as HTMLInputElement).value,
      ),
    ).toBe(1000);
  });

  it('totalAmount auto-calc reflects fee even while Advanced is closed', async () => {
    const user = userEvent.setup();
    renderModal();

    await selectType(user, 'Buy');

    // Open Advanced once to set a non-zero fee, then close it.
    await expandAdvanced(user);
    const feeInput = screen.getByLabelText('Fee');
    await user.clear(feeInput);
    await user.type(feeInput, '5');
    await expandAdvanced(user); // toggle closed

    // Fill the visible BUY fields.
    await user.type(screen.getByRole('textbox', { name: 'Asset' }), 'AAPL');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.type(screen.getByLabelText('Price per Share'), '100');

    await waitFor(() => {
      const totalInput = screen.getByLabelText('Total Amount') as HTMLInputElement;
      // 10 * 100 + 5 = 1005
      expect(totalInput.value).toBe('1005.00');
    });
  });
});

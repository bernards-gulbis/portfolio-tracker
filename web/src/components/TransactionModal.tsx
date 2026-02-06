import { useState, FormEvent, useEffect, useCallback } from 'react';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { Transaction, TransactionType, TransactionCreate, getErrorMessage } from '../api';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  transaction?: Transaction; // If provided, we're editing
}

const TransactionModal = ({ isOpen, onClose, portfolioId, transaction }: TransactionModalProps) => {
  const isEdit = !!transaction;
  
  // Form state
  const [date, setDate] = useState('');
  const [type, setType] = useState<TransactionType>(TransactionType.DEPOSIT);
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [fee, setFee] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [valueEur, setValueEur] = useState('');
  const [splitRatio, setSplitRatio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  const resetForm = useCallback(() => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    
    setDate(localDateTime);
    setType(TransactionType.DEPOSIT);
    setTicker('');
    setQuantity('');
    setPricePerShare('');
    setFee('0.00');
    setTotalAmount('');
    setValueEur('');
    setSplitRatio('');
    setError(null);
  }, []);

  // Initialize form with transaction data if editing
  useEffect(() => {
    if (transaction) {
      // Convert ISO datetime to local datetime-local format
      const transactionDate = new Date(transaction.date);
      const localDateTime = new Date(transactionDate.getTime() - transactionDate.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      
      setDate(localDateTime);
      setType(transaction.type);
      setTicker(transaction.ticker || '');
      setQuantity(transaction.quantity?.toString() || '');
      setPricePerShare(transaction.price_per_share ? transaction.price_per_share.toFixed(2) : '');
      setFee(transaction.fee ? transaction.fee.toFixed(2) : '0.00');
      setTotalAmount(Math.abs(transaction.total_amount).toFixed(2));
      setValueEur(transaction.eur_amount ? Math.abs(transaction.eur_amount).toFixed(2) : '');
      setSplitRatio(transaction.split_ratio?.toString() || '');
    } else {
      resetForm();
    }
  }, [transaction, resetForm]);

  /**
   * Validates form inputs based on transaction type
   * @returns Error message if validation fails, null if valid
   */
  const validateInputs = (): string | null => {
    // Validate quantity is positive for BUY/SELL
    if ([TransactionType.BUY, TransactionType.SELL].includes(type)) {
      const qty = parseFloat(quantity || '0');
      if (qty <= 0) {
        return 'Quantity must be greater than 0';
      }
      const price = parseFloat(pricePerShare || '0');
      if (price <= 0) {
        return 'Price per share must be greater than 0';
      }
    }

    // Validate split ratio is positive
    if (type === TransactionType.SPLIT) {
      const ratio = parseFloat(splitRatio || '0');
      if (ratio <= 0) {
        return 'Split ratio must be greater than 0';
      }
    }

    // Validate total amount for most types
    if (type !== TransactionType.SPLIT) {
      const amount = parseFloat(totalAmount || '0');
      if (amount <= 0) {
        return 'Total amount must be greater than 0';
      }
    }

    // Validate ticker is provided when required
    if ([TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND, TransactionType.SPLIT].includes(type)) {
      if (!ticker || ticker.trim() === '') {
        return 'Ticker symbol is required';
      }
    }

    return null;
  };

  /**
   * Builds transaction data object based on transaction type
   * @param transactionType - Type of transaction
   * @returns TransactionCreate object with appropriate fields populated
   */
  const buildTransactionData = (transactionType: TransactionType): TransactionCreate => {
    const data: TransactionCreate = {
      date: new Date(date).toISOString(),
      type: transactionType,
      total_amount: 0,
    };

    switch (transactionType) {
        case TransactionType.DEPOSIT:
          data.total_amount = Math.abs(parseFloat(totalAmount || '0'));
          if (valueEur && valueEur.trim()) data.eur_amount = Math.abs(parseFloat(valueEur));
          break;

        case TransactionType.WITHDRAW:
          data.total_amount = -Math.abs(parseFloat(totalAmount || '0'));
          if (valueEur && valueEur.trim()) data.eur_amount = -Math.abs(parseFloat(valueEur));
          break;

        case TransactionType.FEE:
          data.total_amount = -Math.abs(parseFloat(totalAmount || '0'));
          break;

        case TransactionType.BUY:
          data.ticker = ticker;
          data.quantity = parseFloat(quantity || '0');
          data.price_per_share = parseFloat(pricePerShare || '0');
          data.fee = Math.abs(parseFloat(fee || '0'));
          data.total_amount = -Math.abs(parseFloat(totalAmount || '0'));
          break;

        case TransactionType.SELL:
          data.ticker = ticker;
          data.quantity = parseFloat(quantity || '0');
          data.price_per_share = parseFloat(pricePerShare || '0');
          data.fee = Math.abs(parseFloat(fee || '0'));
          data.total_amount = Math.abs(parseFloat(totalAmount || '0'));
          break;

        case TransactionType.DIVIDEND:
          data.ticker = ticker;
          data.total_amount = Math.abs(parseFloat(totalAmount || '0'));
          break;

        case TransactionType.SPLIT:
          data.ticker = ticker;
          data.split_ratio = parseFloat(splitRatio || '1');
          data.total_amount = 0; // Split doesn't affect total amount
          break;

        default:
          throw new Error(`Unknown transaction type: ${transactionType}`);
      }

    return data;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Validate inputs first
      const validationError = validateInputs();
      if (validationError) {
        setError(validationError);
        return;
      }

      // Build transaction data
      const data = buildTransactionData(type);

      if (isEdit && transaction) {
        await updateTransaction.mutateAsync({
          transactionId: transaction.id,
          data,
          portfolioId,
        });
      } else {
        await createTransaction.mutateAsync({ portfolioId, data });
      }

      resetForm();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  // Determine which fields to show based on transaction type
  const showTicker = [TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND, TransactionType.SPLIT].includes(type);
  const showQuantity = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showPricePerShare = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showFee = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showTotalAmount = type !== TransactionType.SPLIT;
  const showValueEur = [TransactionType.DEPOSIT, TransactionType.WITHDRAW].includes(type);
  const showSplitRatio = type === TransactionType.SPLIT;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Transaction' : 'Add Transaction'}</h2>
          <button className="btn-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Date */}
            <div className="form-group">
              <label htmlFor="date">Date & Time *</label>
              <input
                id="date"
                type="datetime-local"
                className="form-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Transaction Type */}
            <div className="form-group">
              <label htmlFor="type">Transaction Type *</label>
              <select
                id="type"
                className="form-control"
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
                required
              >
                <option value={TransactionType.DEPOSIT}>Deposit</option>
                <option value={TransactionType.WITHDRAW}>Withdraw</option>
                <option value={TransactionType.BUY}>Buy</option>
                <option value={TransactionType.SELL}>Sell</option>
                <option value={TransactionType.DIVIDEND}>Dividend</option>
                <option value={TransactionType.FEE}>Fee</option>
                <option value={TransactionType.SPLIT}>Split</option>
              </select>
            </div>

            {/* Ticker (for Buy, Sell, Dividend, Split) */}
            {showTicker && (
              <div className="form-group">
                <label htmlFor="ticker">Ticker *</label>
                <input
                  id="ticker"
                  type="text"
                  className="form-control"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL"
                  required
                />
              </div>
            )}

            {/* Quantity (for Buy, Sell) */}
            {showQuantity && (
              <div className="form-group">
                <label htmlFor="quantity">Quantity *</label>
                <input
                  id="quantity"
                  type="number"
                  step="0.00000001"
                  min="0.00000001"
                  className="form-control"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Number of shares"
                  required
                />
              </div>
            )}

            {/* Price per Share (for Buy, Sell) */}
            {showPricePerShare && (
              <div className="form-group">
                <label htmlFor="price-per-share">Price per Share *</label>
                <input
                  id="price-per-share"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            )}

            {/* Fee */}
            {showFee && (
              <div className="form-group">
                <label htmlFor="fee">{type === TransactionType.FEE ? 'Fee Amount *' : 'Fee'}</label>
                <input
                  id="fee"
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="0.00"
                  required={type === TransactionType.FEE}
                />
              </div>
            )}

            {/* Total Amount (for most types) */}
            {showTotalAmount && (
              <div className="form-group">
                <label htmlFor="total-amount">
                  Total Amount *
                </label>
                <input
                  id="total-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            )}

            {/* Amount EUR (for Deposit, Withdraw) */}
            {showValueEur && (
              <div className="form-group">
                <label htmlFor="amount-eur">Amount in EUR</label>
                <input
                  id="amount-eur"
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={valueEur}
                  onChange={(e) => setValueEur(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* Split Ratio (for Split) */}
            {showSplitRatio && (
              <div className="form-group">
                <label htmlFor="split-ratio">Split Ratio *</label>
                <input
                  id="split-ratio"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  value={splitRatio}
                  onChange={(e) => setSplitRatio(e.target.value)}
                  placeholder="e.g., 2 for 2-for-1 split"
                  required
                />
                <small className="form-text">
                  Enter the split ratio (e.g., 2 for a 2-for-1 split)
                </small>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
            >
              {isPending ? (isEdit ? 'Updating...' : 'Adding...') : (isEdit ? 'Update' : 'Add Transaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TransactionModal;

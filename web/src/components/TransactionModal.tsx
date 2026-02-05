import { useState, FormEvent, useEffect } from 'react';
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions';
import { Transaction, TransactionType, getErrorMessage } from '../api';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  transaction?: Transaction; // If provided, we're editing
}

const TransactionModal = ({ isOpen, onClose, portfolioId, transaction }: TransactionModalProps) => {
  const isEdit = !!transaction;
  
  // Form state
  const [dateTime, setDateTime] = useState('');
  const [type, setType] = useState<TransactionType>(TransactionType.DEPOSIT);
  const [ticker, setTicker] = useState('');
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [value, setValue] = useState('');
  const [valueEur, setValueEur] = useState('');
  const [splitRatio, setSplitRatio] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  // Initialize form with transaction data if editing
  useEffect(() => {
    if (transaction) {
      // Convert ISO datetime to local datetime-local format
      const date = new Date(transaction.date_time);
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      
      setDateTime(localDateTime);
      setType(transaction.type);
      setTicker(transaction.ticker || '');
      setUnits(transaction.units?.toString() || '');
      setPrice(transaction.price?.toString() || '');
      setFee(transaction.fee?.toString() || '');
      setValue(transaction.value.toString());
      setValueEur(transaction.value_eur?.toString() || '');
      setSplitRatio(transaction.split_ratio?.toString() || '');
    } else {
      resetForm();
    }
  }, [transaction]);

  const resetForm = () => {
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    
    setDateTime(localDateTime);
    setType(TransactionType.DEPOSIT);
    setTicker('');
    setUnits('');
    setPrice('');
    setFee('');
    setValue('');
    setValueEur('');
    setSplitRatio('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const data: any = {
        date_time: new Date(dateTime).toISOString(),
        type,
      };

      // Add fields based on transaction type
      switch (type) {
        case TransactionType.DEPOSIT:
        case TransactionType.WITHDRAW:
          data.value = parseFloat(value);
          if (valueEur) data.value_eur = parseFloat(valueEur);
          break;

        case TransactionType.FEE:
          data.fee = parseFloat(fee);
          data.value = parseFloat(value);
          break;

        case TransactionType.BUY:
        case TransactionType.SELL:
          data.ticker = ticker;
          data.units = parseFloat(units);
          data.price = parseFloat(price);
          data.fee = parseFloat(fee || '0');
          data.value = parseFloat(value);
          break;

        case TransactionType.DIVIDEND:
          data.ticker = ticker;
          data.price = parseFloat(price); // Amount without fees
          data.fee = parseFloat(fee || '0');
          data.value = parseFloat(value);
          break;

        case TransactionType.SPLIT:
          data.ticker = ticker;
          data.split_ratio = parseFloat(splitRatio);
          data.value = 0; // Split doesn't affect value
          break;
      }

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
  const showUnits = [TransactionType.BUY, TransactionType.SELL].includes(type);
  const showPrice = [TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND].includes(type);
  const showFee = [TransactionType.FEE, TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND].includes(type);
  const showValue = type !== TransactionType.SPLIT;
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
            {/* DateTime */}
            <div className="form-group">
              <label htmlFor="date-time">Date & Time *</label>
              <input
                id="date-time"
                type="datetime-local"
                className="form-control"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
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

            {/* Units (for Buy, Sell) */}
            {showUnits && (
              <div className="form-group">
                <label htmlFor="units">Units *</label>
                <input
                  id="units"
                  type="number"
                  step="0.00000001"
                  className="form-control"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  placeholder="Number of shares"
                  required
                />
              </div>
            )}

            {/* Price (for Buy, Sell, Dividend) */}
            {showPrice && (
              <div className="form-group">
                <label htmlFor="price">
                  {type === TransactionType.DIVIDEND ? 'Amount (without fees) *' : 'Price per Unit *'}
                </label>
                <input
                  id="price"
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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

            {/* Value (for most types) */}
            {showValue && (
              <div className="form-group">
                <label htmlFor="value">
                  Total Value *
                  {type === TransactionType.WITHDRAW && ' (will be saved as negative)'}
                </label>
                <input
                  id="value"
                  type="number"
                  step="0.01"
                  className="form-control"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            )}

            {/* Value EUR (for Deposit, Withdraw) */}
            {showValueEur && (
              <div className="form-group">
                <label htmlFor="value-eur">Value in EUR</label>
                <input
                  id="value-eur"
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

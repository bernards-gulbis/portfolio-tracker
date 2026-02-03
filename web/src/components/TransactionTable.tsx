import { useState } from 'react';
import { Transaction } from '../api';
import { useDeleteTransaction } from '../hooks/useTransactions';
import { formatCurrency, formatDate, getTransactionColor, formatTransactionType } from '../utils/formatters';

interface TransactionTableProps {
  transactions: Transaction[];
  portfolioId: number;
  onEdit: (transaction: Transaction) => void;
}

const TransactionTable = ({ transactions, portfolioId, onEdit }: TransactionTableProps) => {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (transactionId: number) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      setDeletingId(transactionId);
      try {
        await deleteTransaction.mutateAsync({ transactionId, portfolioId });
      } catch (error) {
        console.error('Error deleting transaction:', error);
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <p>No transactions yet.</p>
        <p>Upload a CSV file or add transactions manually.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="transaction-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Ticker</th>
            <th className="text-right">Units</th>
            <th className="text-right">Price</th>
            <th className="text-right">Fee</th>
            <th className="text-right">Value</th>
            <th className="text-right">EUR Value</th>
            <th className="text-right">Split Ratio</th>
            <th className="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} data-testid="transaction-row">
              <td>{formatDate(transaction.date_time)}</td>
              <td>
                <span className={`badge badge-${transaction.type.toLowerCase()}`}>
                  {formatTransactionType(transaction.type)}
                </span>
              </td>
              <td>{transaction.ticker || '-'}</td>
              <td className="text-right">
                {transaction.units !== null ? transaction.units.toFixed(8) : '-'}
              </td>
              <td className="text-right">
                {transaction.price !== null ? formatCurrency(transaction.price) : '-'}
              </td>
              <td className="text-right">{formatCurrency(transaction.fee)}</td>
              <td className={`text-right value-${getTransactionColor(transaction)}`}>
                {formatCurrency(transaction.value)}
              </td>
              <td className="text-right">
                {transaction.value_eur !== null ? formatCurrency(transaction.value_eur, 'EUR') : '-'}
              </td>
              <td className="text-right">
                {transaction.split_ratio !== null ? transaction.split_ratio.toFixed(2) : '-'}
              </td>
              <td className="text-center">
                <div className="action-buttons">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => onEdit(transaction)}
                    disabled={deletingId === transaction.id}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(transaction.id)}
                    disabled={deletingId === transaction.id}
                  >
                    {deletingId === transaction.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionTable;

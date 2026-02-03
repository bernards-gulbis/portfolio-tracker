import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { usePortfolioContext } from '../context/PortfolioContext';
import { Transaction } from '../api';
import TransactionTable from './TransactionTable';
import UploadCSVModal from './UploadCSVModal';

const TransactionView = () => {
  const { activePortfolioId } = usePortfolioContext();
  const { data: transactions, isLoading, error } = useTransactions(activePortfolioId);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleEdit = (transaction: Transaction) => {
    // TODO: Implement edit modal
    console.log('Edit transaction:', transaction);
    alert('Edit functionality coming soon!');
  };

  if (!activePortfolioId) {
    return (
      <div className="transaction-view">
        <div className="empty-state">
          <h2>No Portfolio Selected</h2>
          <p>Select a portfolio from the list to view its transactions.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="transaction-view">
        <div className="transaction-header">
          <h2>Transactions</h2>
        </div>
        <div className="loading">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transaction-view">
        <div className="transaction-header">
          <h2>Transactions</h2>
        </div>
        <div className="error">Error loading transactions: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="transaction-view">
      <div className="transaction-header">
        <h2>Transactions</h2>
        <div className="transaction-actions">
          <button
            className="btn btn-primary"
            onClick={() => setIsUploadModalOpen(true)}
          >
            📁 Upload CSV
          </button>
        </div>
      </div>

      {transactions && (
        <TransactionTable
          transactions={transactions}
          portfolioId={activePortfolioId}
          onEdit={handleEdit}
        />
      )}

      <UploadCSVModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        portfolioId={activePortfolioId}
      />
    </div>
  );
};

export default TransactionView;

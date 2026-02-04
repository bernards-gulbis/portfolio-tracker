import { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { usePortfolioContext } from '../context/PortfolioContext';
import { Transaction, exportTransactionsCSV, getErrorMessage } from '../api';
import TransactionTable from './TransactionTable';
import ImportCSVModal from './UploadCSVModal';

const TransactionView = () => {
  const { activePortfolioId } = usePortfolioContext();
  const { data: transactions, isLoading, error } = useTransactions(activePortfolioId);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleEdit = (transaction: Transaction) => {
    // TODO: Implement edit modal
    console.log('Edit transaction:', transaction);
    alert('Edit functionality coming soon!');
  };

  const handleExport = async () => {
    if (!activePortfolioId) return;

    setIsExporting(true);
    try {
      const blob = await exportTransactionsCSV(activePortfolioId);
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `portfolio_${activePortfolioId}_transactions.csv`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error exporting transactions: ${getErrorMessage(err)}`);
    } finally {
      setIsExporting(false);
    }
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
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={isExporting || !transactions || transactions.length === 0}
            title="Export transactions to CSV"
          >
            {isExporting ? '⏳ Exporting...' : '📥 Export CSV'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsImportModalOpen(true)}
          >
            📤 Import CSV
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

      <ImportCSVModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        portfolioId={activePortfolioId}
      />
    </div>
  );
};

export default TransactionView;

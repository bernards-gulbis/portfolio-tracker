import { useState, useEffect } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { usePortfolioContext } from '../context/PortfolioContext';
import { Transaction, exportTransactionsCSV, getErrorMessage } from '../api';
import TransactionTable from './TransactionTable';
import ImportCSVModal from './UploadCSVModal';
import TransactionModal from './TransactionModal';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';

const TransactionView = () => {
  const { activePortfolioId } = usePortfolioContext();
  const [currentPage, setCurrentPage] = useState(1);
  const { data: paginatedData, isLoading, error } = useTransactions(activePortfolioId, currentPage, DEFAULT_PAGE_SIZE);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [isExporting, setIsExporting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const transactions = paginatedData?.transactions || [];
  const totalPages = paginatedData?.total_pages || 1;
  const total = paginatedData?.total || 0;

  // Reset to page 1 when portfolio changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activePortfolioId]);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      // Check if target is an Element before calling closest (text nodes don't have closest)
      if (target instanceof Element && !target.closest('.header-actions')) {
        setIsMenuOpen(false);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isMenuOpen]);

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsTransactionModalOpen(true);
  };

  const handleAddTransaction = () => {
    setEditingTransaction(undefined);
    setIsTransactionModalOpen(true);
  };

  const handleCloseTransactionModal = () => {
    setIsTransactionModalOpen(false);
    setEditingTransaction(undefined);
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
            className="btn btn-primary"
            onClick={handleAddTransaction}
          >
            + Add Transaction
          </button>
          <div className="header-actions">
            <button
              className="btn-menu"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Transaction table actions menu"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
            >
              ⋮
            </button>
            {isMenuOpen && (
              <div className="action-menu-dropdown">
                <button
                  className="menu-item"
                  onClick={() => {
                    setIsImportModalOpen(true);
                    setIsMenuOpen(false);
                  }}
                >
                  Import CSV
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    handleExport();
                    setIsMenuOpen(false);
                  }}
                  disabled={isExporting || !transactions || transactions.length === 0}
                >
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {transactions && (
        <TransactionTable
          transactions={transactions}
          portfolioId={activePortfolioId}
          onEdit={handleEdit}
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          onPageChange={setCurrentPage}
          isLoading={isLoading}
        />
      )}

      <ImportCSVModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        portfolioId={activePortfolioId}
      />

      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={handleCloseTransactionModal}
        portfolioId={activePortfolioId}
        transaction={editingTransaction}
      />
    </div>
  );
};

export default TransactionView;

import { useState, useEffect } from 'react';
import { Transaction } from '../api';
import { useDeleteTransaction } from '../hooks/useTransactions';
import { formatCurrency, formatDate, formatTransactionType, getDisplayValue } from '../utils/formatters';
import { DEFAULT_PAGE_SIZE, MAX_VISIBLE_PAGES } from '../constants/pagination';

interface TransactionTableProps {
  transactions: Transaction[];
  portfolioId: number;
  onEdit: (transaction: Transaction) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

const TransactionTable = ({ 
  transactions, 
  portfolioId, 
  onEdit,
  currentPage,
  totalPages,
  total,
  onPageChange,
  isLoading
}: TransactionTableProps) => {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const toggleMenu = (transactionId: number) => {
    setOpenMenuId(openMenuId === transactionId ? null : transactionId);
  };

  const closeMenu = () => {
    setOpenMenuId(null);
  };

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      // Check if target is an Element before calling closest (text nodes don't have closest)
      if (target instanceof Element && !target.closest('.action-menu-container')) {
        closeMenu();
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    if (openMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [openMenuId]);

  const handleDelete = async (transactionId: number) => {
    closeMenu();
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      setDeletingId(transactionId);
      try {
        await deleteTransaction.mutateAsync({ transactionId, portfolioId });
        // If we just deleted the last item on this page and we're not on page 1, go back
        if (transactions.length === 1 && currentPage > 1) {
          onPageChange(currentPage - 1);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
        alert(`Failed to delete transaction: ${errorMsg}`);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handlePageChange = (page: number) => {
    onPageChange(page);
    // Scroll to top of table
    document.querySelector('.table-container')?.scrollIntoView({ behavior: 'smooth' });
  };

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];

    if (totalPages <= MAX_VISIBLE_PAGES) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <p>No transactions yet.</p>
        <p>Upload a CSV file or add transactions manually.</p>
      </div>
    );
  }

  const startIndex = (currentPage - 1) * DEFAULT_PAGE_SIZE;
  const endIndex = Math.min(startIndex + transactions.length, total);

  return (
    <>
      <div className="table-info">
        <p>
          Showing {startIndex + 1}-{endIndex} of {total} transactions
        </p>
      </div>
      <div className="table-container">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Ticker</th>
              <th className="text-right">Quantity</th>
              <th className="text-right">Price per Share</th>
              <th className="text-right">Total Amount</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} data-testid="transaction-row">
                <td>{formatDate(transaction.date)}</td>
                <td>
                  <span className={`badge badge-${transaction.type.toLowerCase()}`}>
                    {formatTransactionType(transaction.type)}
                  </span>
                </td>
                <td>{transaction.ticker || '-'}</td>
                <td className="text-right">
                  {transaction.quantity !== null && transaction.quantity !== undefined ? transaction.quantity.toFixed(8) : '-'}
                </td>
                <td className="text-right">
                  {transaction.price_per_share !== null && transaction.price_per_share !== undefined ? formatCurrency(transaction.price_per_share) : '-'}
                </td>
                <td className="text-right">
                  {formatCurrency(getDisplayValue(transaction))}
                </td>
                <td className="text-center">
                  <div className="action-menu-container">
                    <button
                      className="btn-menu"
                      onClick={() => toggleMenu(transaction.id)}
                      disabled={deletingId === transaction.id}
                      aria-label={`Actions for ${transaction.ticker || 'transaction'} on ${formatDate(transaction.date)}`}
                      aria-haspopup="true"
                      aria-expanded={openMenuId === transaction.id}
                    >
                      ⋮
                    </button>
                    {openMenuId === transaction.id && (
                      <div className="action-menu-dropdown">
                        <button
                          className="menu-item"
                          onClick={() => {
                            onEdit(transaction);
                            closeMenu();
                          }}
                          disabled={deletingId === transaction.id}
                        >
                          Edit
                        </button>
                        <button
                          className="menu-item menu-item-danger"
                          onClick={() => handleDelete(transaction.id)}
                          disabled={deletingId === transaction.id}
                        >
                          {deletingId === transaction.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
          >
            Previous
          </button>

          <div className="pagination-numbers">
            {getPageNumbers().map((page, index) =>
              typeof page === 'number' ? (
                <button
                  key={page}
                  className={`btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handlePageChange(page)}
                  disabled={isLoading}
                >
                  {page}
                </button>
              ) : (
                <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                  {page}
                </span>
              )
            )}
          </div>

          <button
            className="btn btn-sm btn-secondary"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
};

export default TransactionTable;

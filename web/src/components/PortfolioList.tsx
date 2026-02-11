import { useState, useEffect } from 'react';
import { usePortfolios, useDeletePortfolio } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';
import { Portfolio } from '../api';
import CreatePortfolioModal from './CreatePortfolioModal';
import EditPortfolioModal from './EditPortfolioModal';
import CopyPortfolioModal from './CopyPortfolioModal';

const PortfolioList = () => {
  const { data: portfolios, isLoading, error } = usePortfolios();
  const { activePortfolioId, setActivePortfolioId } = usePortfolioContext();
  const deletePortfolio = useDeletePortfolio();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editModalState, setEditModalState] = useState<{ isOpen: boolean; portfolio: Portfolio | null }>({
    isOpen: false,
    portfolio: null,
  });
  const [copyModalState, setCopyModalState] = useState<{ isOpen: boolean; portfolio: Portfolio | null }>({
    isOpen: false,
    portfolio: null,
  });

  const toggleMenu = (portfolioId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === portfolioId ? null : portfolioId);
  };

  const closeMenu = () => {
    setOpenMenuId(null);
  };

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.action-menu-container')) {
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

  const handleDelete = async (portfolioId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the portfolio when deleting
    closeMenu();
    
    if (window.confirm('Are you sure you want to delete this portfolio? All transactions will be deleted.')) {
      try {
        await deletePortfolio.mutateAsync(portfolioId);
        // Clear active portfolio if it was deleted
        if (activePortfolioId === portfolioId) {
          setActivePortfolioId(null);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
        alert(`Failed to delete portfolio: ${errorMsg}`);
      }
    }
  };

  const handleEdit = (portfolio: Portfolio, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the portfolio when editing
    closeMenu();
    setEditModalState({ isOpen: true, portfolio });
  };

  const handleCopy = (portfolio: Portfolio, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the portfolio when copying
    closeMenu();
    setCopyModalState({ isOpen: true, portfolio });
  };

  const handlePortfolioClick = (portfolio: Portfolio) => {
    setActivePortfolioId(portfolio.id);
  };

  if (isLoading) {
    return (
      <div className="portfolio-list">
        <div className="portfolio-list-header">
          <h2>Portfolios</h2>
        </div>
        <div className="loading">Loading portfolios...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-list">
        <div className="portfolio-list-header">
          <h2>Portfolios</h2>
        </div>
        <div className="error">Error loading portfolios: {(error as Error).message}</div>
      </div>
    );
  }

  return (
    <div className="portfolio-list">
      <div className="portfolio-list-header">
        <h2>Portfolios</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setIsModalOpen(true)}
        >
          + New Portfolio
        </button>
      </div>

      {portfolios && portfolios.length === 0 ? (
        <div className="empty-state">
          <p>No portfolios yet.</p>
          <p>Create your first portfolio to get started.</p>
        </div>
      ) : (
        <div className="portfolio-cards">
          {portfolios?.map((portfolio) => (
            <div
              key={portfolio.id}
              className={`portfolio-card ${activePortfolioId === portfolio.id ? 'active' : ''} ${openMenuId === portfolio.id ? 'menu-open' : ''}`}
              onClick={() => handlePortfolioClick(portfolio)}
            >
              <div className="portfolio-card-content">
                <h3>{portfolio.name}</h3>
                <p className="portfolio-date">
                  Created: {new Date(portfolio.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="action-menu-container">
                <button
                  className="btn-menu"
                  onClick={(e) => toggleMenu(portfolio.id, e)}
                  disabled={deletePortfolio.isPending}
                  aria-label="Actions menu"
                  aria-haspopup="true"
                  aria-expanded={openMenuId === portfolio.id}
                >
                  ⋮
                </button>
                {openMenuId === portfolio.id && (
                  <div className="action-menu-dropdown">
                    <button
                      className="menu-item"
                      onClick={(e) => handleEdit(portfolio, e)}
                    >
                      Rename
                    </button>
                    <button
                      className="menu-item"
                      onClick={(e) => handleCopy(portfolio, e)}
                    >
                      Copy
                    </button>
                    <button
                      className="menu-item menu-item-danger"
                      onClick={(e) => handleDelete(portfolio.id, e)}
                      disabled={deletePortfolio.isPending}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePortfolioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {editModalState.portfolio && (
        <EditPortfolioModal
          isOpen={editModalState.isOpen}
          onClose={() => setEditModalState({ isOpen: false, portfolio: null })}
          portfolioId={editModalState.portfolio.id}
          currentName={editModalState.portfolio.name}
        />
      )}

      {copyModalState.portfolio && (
        <CopyPortfolioModal
          isOpen={copyModalState.isOpen}
          onClose={() => setCopyModalState({ isOpen: false, portfolio: null })}
          portfolioId={copyModalState.portfolio.id}
          portfolioName={copyModalState.portfolio.name}
        />
      )}
    </div>
  );
};

export default PortfolioList;

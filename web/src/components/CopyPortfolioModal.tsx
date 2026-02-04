import { useState, FormEvent } from 'react';
import { useCopyPortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';

interface CopyPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  portfolioName: string;
}

const CopyPortfolioModal = ({ isOpen, onClose, portfolioId, portfolioName }: CopyPortfolioModalProps) => {
  const [name, setName] = useState(`${portfolioName} (Copy)`);
  const [error, setError] = useState<string | null>(null);
  const copyPortfolio = useCopyPortfolio();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Portfolio name is required');
      return;
    }

    try {
      await copyPortfolio.mutateAsync({ portfolioId, newName: name.trim() });
      setName(`${portfolioName} (Copy)`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleClose = () => {
    setName(`${portfolioName} (Copy)`);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Copy Portfolio</h2>
          <button className="btn-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="portfolio-name">New Portfolio Name</label>
              <input
                id="portfolio-name"
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter new portfolio name"
                autoFocus
                maxLength={255}
              />
              <small className="form-text">
                This will copy "{portfolioName}" with all its transactions.
              </small>
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={copyPortfolio.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={copyPortfolio.isPending || !name.trim()}
            >
              {copyPortfolio.isPending ? 'Copying...' : 'Copy Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CopyPortfolioModal;

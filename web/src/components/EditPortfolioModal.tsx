import { useState, FormEvent, useEffect } from 'react';
import { useUpdatePortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';

interface EditPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
  currentName: string;
}

const EditPortfolioModal = ({ isOpen, onClose, portfolioId, currentName }: EditPortfolioModalProps) => {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const updatePortfolio = useUpdatePortfolio();

  // Update name when currentName prop changes
  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Portfolio name is required');
      return;
    }

    if (name.trim() === currentName) {
      // No changes made
      onClose();
      return;
    }

    try {
      await updatePortfolio.mutateAsync({ 
        portfolioId, 
        data: { name: name.trim() } 
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleClose = () => {
    setName(currentName);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Rename Portfolio</h2>
          <button className="btn-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="portfolio-name">Portfolio Name</label>
              <input
                id="portfolio-name"
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Investment Portfolio"
                autoFocus
              />
            </div>

            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={updatePortfolio.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={updatePortfolio.isPending}
            >
              {updatePortfolio.isPending ? 'Updating...' : 'Update Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPortfolioModal;

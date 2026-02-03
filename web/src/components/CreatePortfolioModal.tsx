import { useState, FormEvent } from 'react';
import { useCreatePortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';

interface CreatePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreatePortfolioModal = ({ isOpen, onClose }: CreatePortfolioModalProps) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createPortfolio = useCreatePortfolio();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Portfolio name is required');
      return;
    }

    try {
      await createPortfolio.mutateAsync({ name: name.trim() });
      setName('');
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleClose = () => {
    setName('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Portfolio</h2>
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
              disabled={createPortfolio.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createPortfolio.isPending}
            >
              {createPortfolio.isPending ? 'Creating...' : 'Create Portfolio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePortfolioModal;

import { useState, FormEvent, ChangeEvent } from 'react';
import { useImportTransactionsCSV } from '../hooks/useTransactions';
import { getErrorMessage } from '../api';

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
}

const ImportCSVModal = ({ isOpen, onClose, portfolioId }: ImportCSVModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importCSV = useImportTransactionsCSV();

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('Please select a file');
      return;
    }

    try {
      const result = await importCSV.mutateAsync({ portfolioId, file });
      alert(`Successfully imported ${result.imported_count} transactions!`);
      setFile(null);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Upload Transactions CSV</h2>
          <button className="btn-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="csv-file">CSV File</label>
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                className="form-control"
                onChange={handleFileChange}
              />
              <small className="form-text">
                Expected format: date, type, ticker, quantity, price_per_share, fee, total_amount, EUR, split_ratio
              </small>
            </div>

            {file && (
              <div className="file-info">
                <strong>Selected file:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </div>
            )}

            {error && <div className="error-message">{error}</div>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={importCSV.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={importCSV.isPending || !file}
            >
              {importCSV.isPending ? 'Importing...' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ImportCSVModal;

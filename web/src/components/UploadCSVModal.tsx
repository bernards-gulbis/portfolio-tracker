import { useState, FormEvent, ChangeEvent } from 'react';
import { useUploadTransactionsCSV } from '../hooks/useTransactions';
import { getErrorMessage } from '../api';

interface UploadCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: number;
}

const UploadCSVModal = ({ isOpen, onClose, portfolioId }: UploadCSVModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadCSV = useUploadTransactionsCSV();

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
      const result = await uploadCSV.mutateAsync({ portfolioId, file });
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
                Expected format: date_time, type, ticker, units, price, fee, value, EUR, split_ratio
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
              disabled={uploadCSV.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploadCSV.isPending || !file}
            >
              {uploadCSV.isPending ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadCSVModal;

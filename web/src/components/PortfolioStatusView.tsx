import React from 'react';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';

interface PortfolioStatusProps {
  portfolioId: number | null;
}

export const PortfolioStatusView: React.FC<PortfolioStatusProps> = ({ portfolioId }) => {
  const { data: status, isLoading, error } = usePortfolioStatus(portfolioId);

  if (!portfolioId) {
    return (
      <div className="portfolio-status">
        <p>Select a portfolio to view its status</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="portfolio-status">
        <p>Loading portfolio status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-status">
        <p className="error">Error loading portfolio status: {(error as Error).message}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="portfolio-status">
        <p>No status data available</p>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatNumber = (value: number, decimals: number = 2) => {
    return value.toFixed(decimals);
  };

  return (
    <div className="portfolio-status">
      <h2>Portfolio Status: {status.portfolio_name}</h2>

      {/* Financial Summary */}
      <div className="status-summary">
        <div className="status-card">
          <h3>Cash Balance</h3>
          <p className="status-value">{formatCurrency(status.cash_balance)}</p>
        </div>

        <div className="status-card">
          <h3>Total Invested</h3>
          <p className="status-value">{formatCurrency(status.total_invested)}</p>
        </div>

        <div className="status-card">
          <h3>Dividends Received</h3>
          <p className="status-value">{formatCurrency(status.dividends_received)}</p>
        </div>

        <div className="status-card">
          <h3>Realized Gains</h3>
          <p className={`status-value ${status.realized_gains >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(status.realized_gains)}
          </p>
        </div>

        <div className="status-card">
          <h3>Total Value EUR</h3>
          <p className="status-value">
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'EUR',
              minimumFractionDigits: 2,
            }).format(status.total_value_eur)}
          </p>
        </div>

        <div className="status-card">
          <h3>Holdings Value</h3>
          <p className="status-value">{formatCurrency(status.total_holdings_cost)}</p>
        </div>
      </div>

      {/* Holdings Table */}
      {status.holdings.length > 0 ? (
        <div className="holdings-section">
          <h3>Current Holdings</h3>
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Units</th>
                <th>Average Cost</th>
                <th>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {status.holdings.map((holding) => (
                <tr key={holding.ticker}>
                  <td><strong>{holding.ticker}</strong></td>
                  <td>{formatNumber(holding.units, 8)}</td>
                  <td>{formatCurrency(holding.average_cost)}</td>
                  <td>{formatCurrency(holding.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="holdings-section">
          <p>No holdings in this portfolio</p>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { formatCurrency, formatNumber } from '../utils/formatters';

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

  return (
    <div className="portfolio-status">
      <h2>Portfolio Status: {status.portfolio_name}</h2>

      {/* Financial Summary */}
      <div className="status-summary">
        <div className="status-card">
          <h3>Portfolio Value</h3>
          <p className="status-value">
            {status.portfolio_value_eur !== null
              ? formatCurrency(status.portfolio_value_eur, 'EUR')
              : '-'}
          </p>
          <p className="status-value-secondary">{formatCurrency(status.portfolio_value)}</p>
        </div>

        <div className="status-card">
          <h3>Invested</h3>
          <p className="status-value">{formatCurrency(status.invested_eur, 'EUR')}</p>
          <p className="status-value-secondary">{formatCurrency(status.invested)}</p>
        </div>
        
        <div className="status-card">
          <h3>Dividends</h3>
          <p className="status-value">
            {status.dividends_eur !== null
              ? formatCurrency(status.dividends_eur, 'EUR')
              : '-'}
          </p>
          <p className="status-value-secondary">{formatCurrency(status.dividends)}</p>
        </div>

        <div className="status-card">
          <h3>Yield</h3>
          <p className={`status-value`}>
            {status.current_yield.toFixed(2)}%
          </p>
        </div>

        <div className="status-card">
          <h3>Realized Gains</h3>
          <p className={`status-value ${status.realized_gains >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(status.realized_gains)}
          </p>
        </div>

        <div className="status-card">
          <h3>Unrealized Gains</h3>
          <p className={`status-value ${status.unrealized_gains >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(status.unrealized_gains)}
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="holdings-section">
        <h3>Current Holdings</h3>
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Quantity</th>
              <th>Avg Cost</th>
              <th>Total Cost</th>
              <th>Current Price</th>
              <th>Market Value</th>
              <th>Unrealized G/L</th>
              <th>G/L %</th>
            </tr>
          </thead>
          <tbody>
            {/* Cash row */}
            <tr key="CASH" className="cash-row">
              <td><strong>CASH</strong></td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>{formatCurrency(status.cash)}</td>
              <td>-</td>
              <td>-</td>
            </tr>
            {/* Stock holdings */}
            {status.holdings.map((holding) => (
              <tr key={holding.ticker}>
                <td><strong>{holding.ticker}</strong></td>
                <td>{formatNumber(holding.quantity, 8)}</td>
                <td>{formatCurrency(holding.average_cost)}</td>
                <td>{formatCurrency(holding.total_cost)}</td>
                <td>
                  {holding.current_price !== null && holding.current_price !== undefined
                    ? formatCurrency(holding.current_price)
                    : '-'}
                </td>
                <td>
                  {holding.current_value !== null && holding.current_value !== undefined
                    ? formatCurrency(holding.current_value)
                    : '-'}
                </td>
                <td className={
                  holding.unrealized_gain_loss !== null && holding.unrealized_gain_loss !== undefined
                    ? holding.unrealized_gain_loss >= 0 ? 'positive' : 'negative'
                    : ''
                }>
                  {holding.unrealized_gain_loss !== null && holding.unrealized_gain_loss !== undefined
                    ? formatCurrency(holding.unrealized_gain_loss)
                    : '-'}
                </td>
                <td className={
                  holding.unrealized_gain_loss_percent !== null && holding.unrealized_gain_loss_percent !== undefined
                    ? holding.unrealized_gain_loss_percent >= 0 ? 'positive' : 'negative'
                    : ''
                }>
                  {holding.unrealized_gain_loss_percent !== null && holding.unrealized_gain_loss_percent !== undefined
                    ? `${holding.unrealized_gain_loss_percent.toFixed(2)}%`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

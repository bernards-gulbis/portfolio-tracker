import React from 'react';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { formatCurrency, formatNumber } from '../utils/formatters';

interface PortfolioStatusProps {
  portfolioId: number | null;
}

// Helper functions for formatting signed values
const formatSignedCurrency = (value: number | null | undefined, currency: string = 'USD'): string => {
  if (value == null) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency)}`;
};

const formatSignedPercent = (value: number | null | undefined): string => {
  if (value == null) return '';
  const sign = value > 0 ? '+' : '';
  return `(${sign}${value.toFixed(2)}%)`;
};

const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'positive' : 'negative';
};

const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: string = 'USD'
): string => {
  if (currencyValue == null) return '-';
  const formattedCurrency = formatSignedCurrency(currencyValue, currency);
  const formattedPercent = percentValue != null ? ` ${formatSignedPercent(percentValue)}` : '';
  return `${formattedCurrency}${formattedPercent}`;
};

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
          <h3>Principal</h3>
          <p className="status-value">{formatCurrency(status.principal_eur, 'EUR')}</p>
          <p className="status-value-secondary">{formatCurrency(status.principal)}</p>
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
          <h3>Tax EUR</h3>
          <p className="status-value">
            {status.tax_eur !== null
              ? formatCurrency(status.tax_eur, 'EUR')
              : '-'}
          </p>
        </div>

        <div className="status-card">
          <h3>Return After Tax</h3>
          <p className={`status-value ${getValueClass(status.total_return_after_tax_eur)}`}>
            {formatCurrencyWithPercent(
              status.total_return_after_tax_eur,
              status.total_return_after_tax_percent,
              'EUR'
            )}
          </p>
        </div>

        <div className="status-card">
          <h3>Current Value</h3>
          <p className="status-value">
            {status.current_value_eur !== null
              ? formatCurrency(status.current_value_eur, 'EUR')
              : '-'}
          </p>
          <p className="status-value-secondary">{formatCurrency(status.current_value)}</p>
        </div>

        <div className="status-card">
          <h3>Unrealized Gains</h3>
          <p className={`status-value ${getValueClass(status.unrealized_gains_eur)}`}>
            {formatCurrencyWithPercent(
              status.unrealized_gains_eur,
              status.unrealized_gains_percent,
              'EUR'
            )}
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
                  {holding.current_price != null ? formatCurrency(holding.current_price) : '-'}
                </td>
                <td>
                  {holding.current_value != null ? formatCurrency(holding.current_value) : '-'}
                </td>
                <td className={getValueClass(holding.unrealized_gain_loss)}>
                  {holding.unrealized_gain_loss != null
                    ? formatCurrency(holding.unrealized_gain_loss)
                    : '-'}
                </td>
                <td className={getValueClass(holding.unrealized_gain_loss_percent)}>
                  {holding.unrealized_gain_loss_percent != null
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

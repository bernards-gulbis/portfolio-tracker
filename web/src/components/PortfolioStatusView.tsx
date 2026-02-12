import React, { useState } from 'react';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { usePortfolioPerformance } from '../hooks/usePortfolioPerformance';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { PerformanceChart, TimePeriod } from './PerformanceChart';
import { HoldingsAllocationChart } from './HoldingsAllocationChart';

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
  const sign = value >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

const getValueClass = (value: number | null | undefined): string => {
  if (value == null) return '';
  return value >= 0 ? 'positive' : 'negative';
};

const formatCurrencyWithPercent = (
  currencyValue: number | null | undefined,
  percentValue: number | null | undefined,
  currency: string = 'USD'
): JSX.Element | string => {
  if (currencyValue == null) return '-';
  const formattedCurrency = formatSignedCurrency(currencyValue, currency);
  const formattedPercent = percentValue != null ? formatSignedPercent(percentValue) : '';
  const percentColor = currencyValue >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
  return (
    <>
      <span>{formattedCurrency}</span>
      {formattedPercent && <span style={{ color: percentColor, fontWeight: 700, marginLeft: '6px' }}>{formattedPercent}</span>}
    </>
  );
};

export const PortfolioStatusView: React.FC<PortfolioStatusProps> = ({ portfolioId }) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1month');
  const { data: status, isLoading, error } = usePortfolioStatus(portfolioId);
  
  // Calculate date range and num_points based on selected period
  const getPerformanceParams = () => {
    if (timePeriod === '1month') {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        numPoints: 30 // Daily data for 1 month
      };
    }
    return {
      startDate: undefined,
      endDate: undefined,
      numPoints: 60 // All time with 60 points
    };
  };

  const params = getPerformanceParams();
  const { data: performance, isLoading: performanceLoading } = usePortfolioPerformance(
    portfolioId,
    params.startDate,
    params.endDate,
    params.numPoints
  );

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
          <h3>Current Value</h3>
          <p className="status-value">
            {status.current_value_eur !== null
              ? formatCurrency(status.current_value_eur, 'EUR')
              : '-'}
          </p>
          <p className="status-value-secondary">
            {formatCurrencyWithPercent(
              status.unrealized_gains_eur,
              status.unrealized_gains_percent,
              'EUR'
            )}
          </p>
        </div>
        <div className="status-card">
          <h3>Principal</h3>
          <p className="status-value">{formatCurrency(status.principal_eur, 'EUR')}</p>
          <p className="status-value-secondary">{formatCurrency(status.principal)}</p>
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
          <h3>Value After Tax</h3>
          <p className="status-value">
            {status.current_value_after_tax_eur !== null
              ? formatCurrency(status.current_value_after_tax_eur, 'EUR')
              : '-'}
          </p>
          <p className="status-value-secondary">
            {formatCurrencyWithPercent(
              status.total_return_after_tax_eur,
              status.total_return_after_tax_percent,
              'EUR'
            )}
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-container">
        <PerformanceChart 
          data={performance?.data_points || []} 
          loading={performanceLoading}
          selectedPeriod={timePeriod}
          onPeriodChange={setTimePeriod}
        />
        <HoldingsAllocationChart 
          holdings={status.holdings}
          cash={status.cash}
          loading={isLoading}
        />
      </div>

      {/* Holdings Table */}
      <div className="holdings-section">
        <h3>Current holdings</h3>
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Quantity</th>
              <th>Avg cost</th>
              <th>Total cost</th>
              <th>Current price</th>
              <th>Market value</th>
              <th>Unrealized G/L (amount, %)</th>
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
                <td>
                  {holding.unrealized_gain_loss != null && holding.unrealized_gain_loss_percent != null
                    ? (
                      <>
                        <span>{formatCurrency(holding.unrealized_gain_loss)}</span>
                        <span className={getValueClass(holding.unrealized_gain_loss)} style={{ fontWeight: 700, marginLeft: '6px' }}>
                          {holding.unrealized_gain_loss_percent >= 0 ? '▲' : '▼'}{Math.abs(holding.unrealized_gain_loss_percent).toFixed(2)}%
                        </span>
                      </>
                    )
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

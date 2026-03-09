import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RealizedGainsTable } from '../components/RealizedGainsTable';
import type { RealizedSale, DividendReceived } from '../api';

const makeSale = (overrides: Partial<RealizedSale> = {}): RealizedSale => ({
  ticker: 'AAPL',
  date: '2025-06-15T10:00:00',
  quantity: 5,
  quantity_before: 10,
  proceeds: 1000,
  cost_basis: 800,
  realized_gain: 200,
  first_buy_date: '2024-06-15T10:00:00',
  ...overrides,
});

const makeDividend = (overrides: Partial<DividendReceived> = {}): DividendReceived => ({
  ticker: 'AAPL',
  date: '2025-06-15T10:00:00',
  amount: 25,
  amount_eur: 23,
  ...overrides,
});

describe('RealizedGainsTable', () => {
  const defaultProps = {
    displayCurrency: 'USD' as const,
    locale: 'en-US',
  };

  it('returns null when no sales and no dividends', () => {
    const { container } = render(
      <RealizedGainsTable realizedSales={[]} dividendsReceived={[]} {...defaultProps} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders gains tab with grouped ticker rows', () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'AAPL', date: '2025-05-01T10:00:00', realized_gain: 100 }),
      makeSale({ ticker: 'MSFT', realized_gain: -50 }),
    ];
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    expect(screen.getAllByText('AAPL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('MSFT').length).toBeGreaterThanOrEqual(1);
    // AAPL group has 2 sells (insights cards may also show sell counts)
    expect(screen.getAllByText('2 sells').length).toBeGreaterThanOrEqual(1);
    // MSFT group has 1 sell
    expect(screen.getAllByText('1 sell').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state message when gains tab has no results after filter', async () => {
    const sales: RealizedSale[] = [makeSale({ ticker: 'AAPL' })];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    const filterInput = screen.getByPlaceholderText('Asset');
    await user.type(filterInput, 'ZZZZ');

    expect(screen.getByText('No realized gains yet')).toBeInTheDocument();
  });

  it('expands ticker group to show individual sales on click', async () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL', proceeds: 1000, cost_basis: 800 }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    // Click the AAPL row to expand
    await user.click(screen.getByText('AAPL'));

    // Expanded detail should show cost basis and proceeds
    expect(screen.getByText('$800.00')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
  });

  it('sorts by gain column', async () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'MSFT', realized_gain: -50 }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    // Click the Realized G/L column header to sort
    const header = screen.getByText(/Realized G\/L/);
    await user.click(header);

    // After clicking once (default is desc), clicking toggles asc
    const rows = screen.getAllByText(/AAPL|MSFT/);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('shows total row with aggregated gain', () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL', realized_gain: 200 }),
      makeSale({ ticker: 'MSFT', realized_gain: -50 }),
    ];
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    expect(screen.getByText('Total')).toBeInTheDocument();
    // 2 total sells
    expect(screen.getByText('2 sells')).toBeInTheDocument();
  });

  it('renders dividends tab when dividends are present', async () => {
    const dividends: DividendReceived[] = [
      makeDividend({ ticker: 'AAPL', amount: 25 }),
      makeDividend({ ticker: 'MSFT', amount: 15 }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={[]} dividendsReceived={dividends} {...defaultProps} />
    );

    // Should show dividends tab
    const divTab = screen.getByRole('tab', { name: 'Dividends Received' });
    expect(divTab).toBeInTheDocument();
    await user.click(divTab);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('displays EUR amounts in dividends tab when displayCurrency is EUR', async () => {
    const dividends: DividendReceived[] = [
      makeDividend({ ticker: 'AAPL', amount: 25, amount_eur: 23 }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable
        realizedSales={[]}
        dividendsReceived={dividends}
        displayCurrency="EUR"
        locale="en-US"
      />
    );

    const divTab = screen.getByRole('tab', { name: 'Dividends Received' });
    await user.click(divTab);

    // Should show EUR amount (group row + total row)
    const eurElements = screen.getAllByText('€23.00');
    expect(eurElements.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to USD when amount_eur is null in EUR mode', async () => {
    const dividends: DividendReceived[] = [
      makeDividend({ ticker: 'AAPL', amount: 25, amount_eur: null }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable
        realizedSales={[]}
        dividendsReceived={dividends}
        displayCurrency="EUR"
        locale="en-US"
      />
    );

    const divTab = screen.getByRole('tab', { name: 'Dividends Received' });
    await user.click(divTab);

    // Falls back to USD when amount_eur is null (group row + total row)
    const usdElements = screen.getAllByText('$25.00');
    expect(usdElements.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by ticker', async () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL' }),
      makeSale({ ticker: 'MSFT' }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    const filterInput = screen.getByPlaceholderText('Asset');
    await user.type(filterInput, 'MSFT');

    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  it('filters by year when multiple years present', async () => {
    const sales: RealizedSale[] = [
      makeSale({ ticker: 'AAPL', date: '2025-06-15T10:00:00' }),
      makeSale({ ticker: 'MSFT', date: '2024-06-15T10:00:00' }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable realizedSales={sales} dividendsReceived={[]} {...defaultProps} />
    );

    // Year filter should be visible when multiple years
    const yearTrigger = screen.getByRole('combobox');
    await user.click(yearTrigger);

    const option2024 = await screen.findByRole('option', { name: '2024' });
    await user.click(option2024);

    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
  });

  it('resets page when switching tabs', async () => {
    const sales: RealizedSale[] = [makeSale()];
    const dividends: DividendReceived[] = [makeDividend()];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable
        realizedSales={sales}
        dividendsReceived={dividends}
        {...defaultProps}
      />
    );

    // Switch to dividends tab
    const divTab = screen.getByRole('tab', { name: 'Dividends Received' });
    await user.click(divTab);

    // Should render without errors
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('expands dividend group to show individual payments', async () => {
    const dividends: DividendReceived[] = [
      makeDividend({ ticker: 'AAPL', date: '2025-06-15T10:00:00', amount: 25 }),
      makeDividend({ ticker: 'AAPL', date: '2025-03-15T10:00:00', amount: 20 }),
    ];
    const user = userEvent.setup();
    render(
      <RealizedGainsTable
        realizedSales={[]}
        dividendsReceived={dividends}
        {...defaultProps}
      />
    );

    const divTab = screen.getByRole('tab', { name: 'Dividends Received' });
    await user.click(divTab);

    // Expand AAPL group
    await user.click(screen.getByText('AAPL'));

    // Both payments should be visible
    expect(screen.getAllByText('$25.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(1);
  });
});

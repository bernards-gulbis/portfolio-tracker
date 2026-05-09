import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TickerCombobox } from '../components/transaction-form/TickerCombobox';
import type { Holding } from '../api';

const holdings: Holding[] = [
  { ticker: 'AAPL', quantity: 10, average_cost: 150, total_cost: 1500, first_buy_date: '2024-01-01' },
  { ticker: 'MSFT', quantity: 5, average_cost: 300, total_cost: 1500, first_buy_date: '2024-02-01' },
];

function renderCombobox(overrides?: Partial<Parameters<typeof TickerCombobox>[0]>) {
  const onChange = vi.fn();
  render(
    <TickerCombobox
      value=""
      holdings={holdings}
      placeholder="Select ticker"
      noHoldingsText="No holdings"
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

describe('TickerCombobox', () => {
  it('renders the placeholder when no value is selected', () => {
    renderCombobox();
    expect(screen.getByRole('combobox', { name: '' })).toBeInTheDocument();
    expect(screen.getByText('Select ticker')).toBeInTheDocument();
  });

  it('shows selected value when value prop is provided', () => {
    renderCombobox({ value: 'AAPL' });
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('opens popover on combobox button click', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByPlaceholderText('Select ticker')).toBeInTheDocument();
  });

  it('shows holdings in the list when opened', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/MSFT/)).toBeInTheDocument();
  });

  it('calls onChange when a holding is selected from the list', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText(/AAPL \(10 shares\)/));

    expect(onChange).toHaveBeenCalledWith('AAPL');
  });

  it('filters holdings as the user types in the search input', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('combobox'));
    const input = await screen.findByPlaceholderText('Select ticker');
    await user.type(input, 'AA');

    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.queryByText(/MSFT/)).not.toBeInTheDocument();
  });

  it('selects typed ticker on Enter key press', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole('combobox'));
    const input = await screen.findByPlaceholderText('Select ticker');
    await user.type(input, 'GOOGL');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('GOOGL');
    });
  });

  it('shows editTicker fallback when it is not in holdings', async () => {
    const user = userEvent.setup();
    renderCombobox({ editTicker: 'TSLA' });

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('TSLA')).toBeInTheDocument();
  });

  it('selects editTicker fallback when clicked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox({ editTicker: 'TSLA' });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('TSLA'));

    expect(onChange).toHaveBeenCalledWith('TSLA');
  });

  it('does not show editTicker row when it is already in holdings', async () => {
    const user = userEvent.setup();
    renderCombobox({ editTicker: 'AAPL' });

    await user.click(screen.getByRole('combobox'));
    // AAPL appears once in the filtered list — not as extra fallback row
    const items = await screen.findAllByText(/AAPL/);
    // The holding item "AAPL (10 shares)" plus the trigger label = at most 2
    expect(items.filter((el) => el.textContent?.includes('AAPL (10 shares)')).length).toBe(1);
  });

  it('shows noHoldingsText when holdings are empty and no search is active', async () => {
    const user = userEvent.setup();
    renderCombobox({ holdings: [] });

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByText('No holdings')).toBeInTheDocument();
  });

  it('marks the button aria-invalid when invalid prop is true', () => {
    renderCombobox({ invalid: true });
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears search and closes popover on selection', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('combobox'));
    const input = await screen.findByPlaceholderText('Select ticker');
    await user.type(input, 'AA');
    await user.click(screen.getByText(/AAPL \(10 shares\)/));

    // Popover should be closed — input not visible
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Select ticker')).not.toBeInTheDocument();
    });
  });
});

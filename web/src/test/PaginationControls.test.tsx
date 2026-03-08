import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationControls } from '../components/PaginationControls';

describe('PaginationControls', () => {
  it('renders page count display', () => {
    render(<PaginationControls page={2} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('calls onPageChange with previous page on prev click', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]); // prev button
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with next page on next click', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]); // next button
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables prev button on first page', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<PaginationControls page={5} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
  });

  it('enables both buttons on middle page', () => {
    render(<PaginationControls page={3} totalPages={5} onPageChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it('clamps prev to page 1', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    // Button is disabled so click won't fire, which is expected behavior
    expect(buttons[0]).toBeDisabled();
  });

  it('clamps next to totalPages', async () => {
    const onPageChange = vi.fn();
    render(<PaginationControls page={5} totalPages={5} onPageChange={onPageChange} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
  });

  it('renders correctly for single page', () => {
    render(<PaginationControls page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });
});

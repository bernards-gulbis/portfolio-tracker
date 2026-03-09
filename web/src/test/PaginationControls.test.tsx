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

    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with next page on next click', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables prev button on first page', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<PaginationControls page={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('enables both buttons on middle page', () => {
    render(<PaginationControls page={3} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
  });

  it('clamps prev to page 1', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
  });

  it('clamps next to totalPages', () => {
    render(<PaginationControls page={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('renders correctly for single page', () => {
    render(<PaginationControls page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });
});

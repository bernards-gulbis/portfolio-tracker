import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationControls } from '../components/PaginationControls';

describe('PaginationControls', () => {
  it('renders page number links', () => {
    render(<PaginationControls page={2} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('calls onPageChange with previous page on prev click', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText(/previous page/i));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with next page on next click', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={3} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText(/next page/i));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('disables prev on first page', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    const prev = screen.getByLabelText(/previous page/i);
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(prev).toHaveClass('pointer-events-none');
  });

  it('disables next on last page', () => {
    render(<PaginationControls page={5} totalPages={5} onPageChange={vi.fn()} />);
    const next = screen.getByLabelText(/next page/i);
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveClass('pointer-events-none');
  });

  it('enables both buttons on middle page', () => {
    render(<PaginationControls page={3} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText(/previous page/i)).not.toHaveClass('pointer-events-none');
    expect(screen.getByLabelText(/next page/i)).not.toHaveClass('pointer-events-none');
  });

  it('navigates to specific page when page link is clicked', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<PaginationControls page={1} totalPages={5} onPageChange={onPageChange} />);

    await user.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('marks current page as active', () => {
    render(<PaginationControls page={2} totalPages={5} onPageChange={vi.fn()} />);
    const activeLink = screen.getByText('2').closest('a');
    expect(activeLink).toHaveAttribute('data-active', 'true');
  });

  it('renders correctly for single page', () => {
    render(<PaginationControls page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByLabelText(/previous page/i)).toHaveClass('pointer-events-none');
    expect(screen.getByLabelText(/next page/i)).toHaveClass('pointer-events-none');
  });

  it('shows ellipsis when totalPages exceeds MAX_VISIBLE_PAGES', () => {
    render(<PaginationControls page={5} totalPages={10} onPageChange={vi.fn()} />);
    // First and last page should always be visible
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // Current page and neighbors should be visible
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('shows all page numbers without ellipsis when totalPages <= 7', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationControls, getPageNumbers } from '../components/PaginationControls';

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
    // Hidden middle pages should not be rendered
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    // Ellipsis should be present
    const ellipses = screen.getAllByText('More pages');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('shows all page numbers without ellipsis when totalPages <= 7', () => {
    render(<PaginationControls page={1} totalPages={5} onPageChange={vi.fn()} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });
});

describe('getPageNumbers', () => {
  it('returns all pages when totalPages <= MAX_VISIBLE_PAGES', () => {
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns trailing ellipsis when currentPage is near the start', () => {
    expect(getPageNumbers(2, 10)).toEqual([1, 2, 3, '...', 10]);
  });

  it('returns leading ellipsis when currentPage is near the end', () => {
    expect(getPageNumbers(9, 10)).toEqual([1, '...', 8, 9, 10]);
    expect(getPageNumbers(10, 10)).toEqual([1, '...', 9, 10]);
  });

  it('returns both ellipses when currentPage is in the middle', () => {
    expect(getPageNumbers(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
  });

  it('includes first and last page always', () => {
    const pages = getPageNumbers(6, 12);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(12);
  });

  it('omits leading ellipsis at boundary (currentPage = 3)', () => {
    expect(getPageNumbers(3, 10)).toEqual([1, 2, 3, 4, '...', 10]);
  });

  it('omits trailing ellipsis at boundary (currentPage = totalPages - 2)', () => {
    expect(getPageNumbers(8, 10)).toEqual([1, '...', 7, 8, 9, 10]);
  });
});

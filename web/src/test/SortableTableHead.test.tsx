import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SortableTableHead } from '../components/SortableTableHead';
import { Table, TableHeader, TableRow } from '@/components/ui/table';

const renderHead = (props: Partial<Parameters<typeof SortableTableHead>[0]> = {}) => {
  const onSort = vi.fn();
  render(
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead
            label="Price"
            sortKey="price"
            activeSortKey="price"
            sortAsc={true}
            onSort={onSort}
            {...props}
          />
        </TableRow>
      </TableHeader>
    </Table>
  );
  return { onSort };
};

describe('SortableTableHead', () => {
  it('calls onSort when clicked', async () => {
    const { onSort } = renderHead();
    await userEvent.click(screen.getByRole('button', { name: /price/i }));
    expect(onSort).toHaveBeenCalledWith('price');
  });

  it('calls onSort on Enter key', () => {
    const { onSort } = renderHead();
    fireEvent.keyDown(screen.getByRole('button', { name: /price/i }), { key: 'Enter' });
    expect(onSort).toHaveBeenCalledWith('price');
  });

  it('calls onSort on Space key', () => {
    const { onSort } = renderHead();
    fireEvent.keyDown(screen.getByRole('button', { name: /price/i }), { key: ' ' });
    expect(onSort).toHaveBeenCalledWith('price');
  });

  it('does not call onSort on other keys', () => {
    const { onSort } = renderHead();
    fireEvent.keyDown(screen.getByRole('button', { name: /price/i }), { key: 'Tab' });
    expect(onSort).not.toHaveBeenCalled();
  });

  it('shows chevron up when active and sortAsc', () => {
    renderHead({ activeSortKey: 'price', sortAsc: true });
    // ChevronUpIcon renders an svg — check it exists
    const button = screen.getByRole('button', { name: /price/i });
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('shows chevron down when active and not sortAsc', () => {
    renderHead({ activeSortKey: 'price', sortAsc: false });
    const button = screen.getByRole('button', { name: /price/i });
    expect(button.querySelector('svg')).toBeTruthy();
  });

  it('shows no chevron when inactive', () => {
    renderHead({ activeSortKey: 'name', sortAsc: true });
    const button = screen.getByRole('button', { name: /price/i });
    expect(button.querySelector('svg')).toBeNull();
  });
});

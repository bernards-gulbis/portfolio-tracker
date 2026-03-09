import { TableHead } from '@/components/ui/table';

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortAsc: boolean;
  onSort: (key: string) => void;
  className?: string;
}

export const SortableTableHead = ({ label, sortKey, activeSortKey, sortAsc, onSort, className }: SortableTableHeadProps) => {
  let indicator = '';
  if (sortKey === activeSortKey) {
    indicator = sortAsc ? ' ▲' : ' ▼';
  }
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      onClick={() => onSort(sortKey)}
    >
      {label}{indicator}
    </TableHead>
  );
};

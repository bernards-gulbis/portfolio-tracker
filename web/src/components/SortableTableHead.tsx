import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
      role="button"
      tabIndex={0}
      className={cn('cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(sortKey);
        }
      }}
    >
      {label}{indicator}
    </TableHead>
  );
};

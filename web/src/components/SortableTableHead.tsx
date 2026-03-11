import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortAsc: boolean;
  onSort: (key: string) => void;
  className?: string;
}

export const SortableTableHead = ({ label, sortKey, activeSortKey, sortAsc, onSort, className }: SortableTableHeadProps) => {
  const isActive = sortKey === activeSortKey;
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
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive && (sortAsc
          ? <ChevronUpIcon className="h-3.5 w-3.5" />
          : <ChevronDownIcon className="h-3.5 w-3.5" />
        )}
      </span>
    </TableHead>
  );
};

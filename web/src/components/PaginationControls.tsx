import { useTranslation } from 'react-i18next';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { MAX_VISIBLE_PAGES } from '../constants/pagination';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];

  if (totalPages <= MAX_VISIBLE_PAGES) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return pages;
}

export const PaginationControls = ({ page, totalPages, onPageChange }: PaginationControlsProps) => {
  const { t } = useTranslation();
  return (
    <div className="border-t px-4 py-2">
      <Pagination className="w-auto mx-0">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => page > 1 && onPageChange(page - 1)}
              aria-disabled={page <= 1}
              tabIndex={page <= 1 ? -1 : undefined}
              aria-label={t('status.previousPage')}
              className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>

          {getPageNumbers(page, totalPages).map((p, index) => (
            <PaginationItem key={typeof p === 'number' ? p : `ellipsis-${index}`}>
              {typeof p === 'number' ? (
                <PaginationLink
                  onClick={() => onPageChange(p)}
                  isActive={p === page}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              ) : (
                <PaginationEllipsis />
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              onClick={() => page < totalPages && onPageChange(page + 1)}
              aria-disabled={page >= totalPages}
              tabIndex={page >= totalPages ? -1 : undefined}
              aria-label={t('status.nextPage')}
              className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

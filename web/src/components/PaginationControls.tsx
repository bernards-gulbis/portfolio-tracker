import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChevronRightIcon, ChevronLeftIcon } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const PaginationControls = ({ page, totalPages, onPageChange }: PaginationControlsProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 border-t">
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('status.previousPage')}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground">
        {t('status.pageOf', { page, total: totalPages })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('status.nextPage')}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        <ChevronRightIcon className="h-4 w-4" />
      </Button>
    </div>
  );
};

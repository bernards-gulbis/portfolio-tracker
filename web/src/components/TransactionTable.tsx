import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, TransactionType, getErrorMessage } from '../api';
import { useDeleteTransaction } from '../hooks/useTransactions';
import { formatCurrency, formatDate, getDisplayValue } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { DEFAULT_PAGE_SIZE, MAX_VISIBLE_PAGES } from '../constants/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { MoreVertical, PencilIcon, TrashIcon, ReceiptIcon, Trash2Icon, SearchIcon, FilterIcon, ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { toast } from 'sonner';

interface TransactionTableProps {
  transactions: Transaction[];
  portfolioId: number;
  onEdit: (transaction: Transaction) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  tickerSearch: string;
  onTickerSearchChange: (value: string) => void;
  typeFilter: string[];
  onTypeFilterChange: (value: string[]) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (value: 'asc' | 'desc') => void;
}


const TransactionTable = ({
  transactions,
  portfolioId,
  onEdit,
  currentPage,
  totalPages,
  total,
  onPageChange,
  isLoading,
  tickerSearch,
  onTickerSearchChange,
  typeFilter,
  onTypeFilterChange,
  sortOrder,
  onSortOrderChange,
}: TransactionTableProps) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const deleteTransaction = useDeleteTransaction();

  const transactionTypeLabels = useMemo<Record<TransactionType, string>>(() => ({
    [TransactionType.DEPOSIT]: t('transaction.modal.types.Deposit'),
    [TransactionType.WITHDRAW]: t('transaction.modal.types.Withdraw'),
    [TransactionType.BUY]: t('transaction.modal.types.Buy'),
    [TransactionType.SELL]: t('transaction.modal.types.Sell'),
    [TransactionType.DIVIDEND]: t('transaction.modal.types.Dividend'),
    [TransactionType.FEE]: t('transaction.modal.types.Fee'),
    [TransactionType.SPLIT]: t('transaction.modal.types.Split'),
  }), [t]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; transactionId: number | null }>({ open: false, transactionId: null });

  const toggleMenu = (transactionId: number) => {
    setOpenMenuId(openMenuId === transactionId ? null : transactionId);
  };

  const closeMenu = () => {
    setOpenMenuId(null);
  };

  const handleDeleteClick = (transactionId: number) => {
    closeMenu();
    setDeleteConfirm({ open: true, transactionId });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.transactionId == null) return;
    const transactionId = deleteConfirm.transactionId;
    setDeleteConfirm({ open: false, transactionId: null });
    setDeletingId(transactionId);
    try {
      await deleteTransaction.mutateAsync({ transactionId, portfolioId });
      if (transactions.length === 1 && currentPage > 1) {
        onPageChange(currentPage - 1);
      }
    } catch (error) {
      toast.error(t('transaction.delete.errorToast', { message: getErrorMessage(error) }));
    } finally {
      setDeletingId(null);
    }
  };

  const handlePageChange = (page: number) => {
    onPageChange(page);
    document.querySelector('[data-table-container]')?.scrollIntoView({ behavior: 'smooth' });
  };

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];

    if (totalPages <= MAX_VISIBLE_PAGES) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const hasActiveFilters = tickerSearch !== '' || typeFilter.length > 0;

  const startIndex = (currentPage - 1) * DEFAULT_PAGE_SIZE;
  const endIndex = Math.min(startIndex + (transactions.length || 0), total);

  const filterBar = (
    <div className="flex items-center gap-3 mb-3">
      <div className="relative max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="ticker-search"
          value={tickerSearch}
          onChange={(e) => onTickerSearchChange(e.target.value)}
          placeholder={t('transaction.table.filters.tickerPlaceholder')}
          className="pl-8"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[160px] justify-start gap-2">
            <FilterIcon className="h-4 w-4 text-muted-foreground" />
            {typeFilter.length === 0
              ? t('transaction.table.filters.typeAll')
              : typeFilter.length === 1
                ? transactionTypeLabels[typeFilter[0] as TransactionType]
                : t('transaction.table.filters.typeCount', { count: typeFilter.length })}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {Object.values(TransactionType).map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={typeFilter.includes(type)}
              onCheckedChange={(checked) =>
                onTypeFilterChange(
                  checked
                    ? [...typeFilter, type]
                    : typeFilter.filter((t) => t !== type)
                )
              }
              onSelect={(e) => e.preventDefault()}
            >
              {transactionTypeLabels[type]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {total > 0 && (
        <p className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
          {t('transaction.table.showing', { from: startIndex + 1, to: endIndex, total })}
        </p>
      )}
    </div>
  );

  if (transactions.length === 0) {
    return (
      <>
        {filterBar}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptIcon />
            </EmptyMedia>
            <EmptyTitle>
              {hasActiveFilters
                ? t('transaction.table.emptyFiltered.title')
                : t('transaction.table.empty.title')}
            </EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? t('transaction.table.emptyFiltered.description')
                : t('transaction.table.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  return (
    <>
      {filterBar}
      <div className="overflow-x-auto" data-table-container>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
                  onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
                >
                  {t('transaction.table.columns.date')}
                  {sortOrder === 'desc'
                    ? <ArrowDownIcon className="h-3.5 w-3.5" />
                    : <ArrowUpIcon className="h-3.5 w-3.5" />}
                </button>
              </TableHead>
              <TableHead>{t('transaction.table.columns.type')}</TableHead>
              <TableHead>{t('transaction.table.columns.ticker')}</TableHead>
              <TableHead>{t('transaction.table.columns.details')}</TableHead>
              <TableHead className="text-right">{t('transaction.table.columns.totalAmount')}</TableHead>
              <TableHead className="text-center">{t('transaction.table.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id} data-testid="transaction-row">
                <TableCell>{formatDate(transaction.date, locale)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {transactionTypeLabels[transaction.type]}
                  </Badge>
                </TableCell>
                <TableCell>{transaction.ticker || '-'}</TableCell>
                <TableCell>
                  {transaction.quantity != null && transaction.price_per_share != null
                    ? `${parseFloat(transaction.quantity.toFixed(8))} shares at ${formatCurrency(transaction.price_per_share, 'USD', locale)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(getDisplayValue(transaction), 'USD', locale)}
                </TableCell>
                <TableCell className="text-center">
                  <DropdownMenu open={openMenuId === transaction.id} onOpenChange={(open) => {
                    if (open) toggleMenu(transaction.id);
                    else closeMenu();
                  }}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deletingId === transaction.id}
                        aria-label={t('transaction.table.actions.label', { ticker: transaction.ticker || '-', date: formatDate(transaction.date, locale) })}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => { onEdit(transaction); closeMenu(); }}
                          disabled={deletingId === transaction.id}
                        >
                          <PencilIcon />
                          {t('transaction.table.actions.edit')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteClick(transaction.id)}
                          disabled={deletingId === transaction.id}
                        >
                          <TrashIcon />
                          {deletingId === transaction.id ? t('transaction.table.actions.deleting') : t('transaction.table.actions.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(currentPage - 1)}
                  aria-disabled={currentPage === 1 || isLoading}
                  className={currentPage === 1 || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>

              {getPageNumbers().map((page, index) => (
                <PaginationItem key={typeof page === 'number' ? page : `ellipsis-${index}`}>
                  {typeof page === 'number' ? (
                    <PaginationLink
                      onClick={() => handlePageChange(page)}
                      isActive={page === currentPage}
                      className={isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    >
                      {page}
                    </PaginationLink>
                  ) : (
                    <PaginationEllipsis />
                  )}
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(currentPage + 1)}
                  aria-disabled={currentPage === totalPages || isLoading}
                  className={currentPage === totalPages || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => !open && setDeleteConfirm({ open: false, transactionId: null })}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('transaction.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transaction.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">{t('transaction.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              {t('transaction.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TransactionTable;

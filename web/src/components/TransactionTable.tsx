import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Transaction, TransactionType, getErrorMessage } from '../api';
import { useDeleteTransaction } from '../hooks/useTransactions';
import { formatCurrency, formatDateTime, formatDateCompact } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCaption,
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
import { MoreVertical, PencilIcon, TrashIcon, ReceiptIcon, Trash2Icon, SearchIcon, FilterIcon } from 'lucide-react';
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
import { SortableTableHead } from './SortableTableHead';
import { PaginationControls } from './PaginationControls';
import { TRANSACTION_TYPE_ORDER } from './transaction-form/schema';

const TYPE_BADGE_CLASSES: Record<TransactionType, string> = {
  [TransactionType.BUY]: 'bg-badge-buy-bg text-badge-buy-fg',
  [TransactionType.SELL]: 'bg-badge-sell-bg text-badge-sell-fg',
  [TransactionType.DEPOSIT]: 'bg-badge-deposit-bg text-badge-deposit-fg',
  [TransactionType.WITHDRAW]: 'bg-badge-withdraw-bg text-badge-withdraw-fg',
  [TransactionType.DIVIDEND]: 'bg-badge-dividend-bg text-badge-dividend-fg',
  [TransactionType.FEE]: 'bg-badge-fee-bg text-badge-fee-fg',
  [TransactionType.SPLIT]: 'bg-badge-split-bg text-badge-split-fg',
};

interface TransactionTableProps {
  transactions: Transaction[];
  portfolioId: number;
  onEdit: (transaction: Transaction) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  responsePage: number;
  responsePageSize: number;
  onPageChange: (page: number) => void;
  tickerSearch: string;
  onTickerSearchChange: (value: string) => void;
  typeFilter: string[];
  onTypeFilterChange: (value: string[]) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (value: 'asc' | 'desc') => void;
  fxMissingTxIds?: number[];
}

export const TransactionTable = ({
  transactions,
  portfolioId,
  onEdit,
  currentPage,
  totalPages,
  total,
  responsePage,
  responsePageSize,
  onPageChange,
  tickerSearch,
  onTickerSearchChange,
  typeFilter,
  onTypeFilterChange,
  sortOrder,
  onSortOrderChange,
  fxMissingTxIds = [],
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

  const handleDeleteClick = (transactionId: number) => {
    setOpenMenuId(null);
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

  const getTransactionDetails = (transaction: Transaction): string => {
    if (transaction.type === TransactionType.SPLIT && transaction.split_ratio != null) {
      return t('transaction.table.columns.splitFormat', { ratio: transaction.split_ratio });
    }
    if (transaction.quantity != null && transaction.price_per_share != null) {
      return t('transaction.table.columns.detailsFormat', {
        qty: Number.parseFloat(transaction.quantity.toFixed(8)),
        price: formatCurrency(transaction.price_per_share, 'USD', locale),
      });
    }
    return '-';
  };

  const fxMissingSet = useMemo(() => new Set(fxMissingTxIds), [fxMissingTxIds]);

  const hasActiveFilters = tickerSearch !== '' || typeFilter.length > 0;

  const startIndex = (responsePage - 1) * responsePageSize;
  const endIndex = Math.min(startIndex + transactions.length, total);

  let typeFilterLabel: string;
  if (typeFilter.length === 0) {
    typeFilterLabel = t('transaction.table.filters.typeAll');
  } else if (typeFilter.length === 1) {
    typeFilterLabel = transactionTypeLabels[typeFilter[0] as TransactionType];
  } else {
    typeFilterLabel = t('transaction.table.filters.typeCount', { count: typeFilter.length });
  }

  const filterBar = (
    <div className="flex items-center gap-3 mb-3">
      <div className="relative max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="ticker-search"
          value={tickerSearch}
          onChange={(e) => onTickerSearchChange(e.target.value)}
          placeholder={t('transaction.table.filters.tickerPlaceholder')}
          aria-label={t('transaction.table.filters.tickerPlaceholder')}
          className="pl-8"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-[160px] justify-start gap-2">
            <FilterIcon className="h-4 w-4 text-muted-foreground" />
            {typeFilterLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {TRANSACTION_TYPE_ORDER.map((type) => (
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
        {hasActiveFilters && filterBar}
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
        <Table className="min-w-[600px]">
          <TableCaption className="sr-only">{t('transaction.view.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                label={t('transaction.table.columns.date')}
                sortKey="date"
                activeSortKey="date"
                sortAsc={sortOrder === 'asc'}
                onSort={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
              />
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
                <TableCell>{formatDateCompact(transaction.date, locale)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={TYPE_BADGE_CLASSES[transaction.type]}>
                    {transactionTypeLabels[transaction.type]}
                  </Badge>
                </TableCell>
                <TableCell>{transaction.ticker || '-'}</TableCell>
                <TableCell>
                  {getTransactionDetails(transaction)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="inline-flex items-center justify-end gap-2">
                    {fxMissingSet.has(transaction.id) && (
                      <button
                        type="button"
                        onClick={() => onEdit(transaction)}
                        className="cursor-pointer"
                        aria-label={t('transaction.fxNeededHelp')}
                        title={t('transaction.fxNeededHelp')}
                      >
                        <Badge variant="secondary" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                          {t('transaction.fxNeededBadge')}
                        </Badge>
                      </button>
                    )}
                    <span>{formatCurrency(transaction.total_amount, 'USD', locale)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <DropdownMenu open={openMenuId === transaction.id} onOpenChange={(open) => setOpenMenuId(open ? transaction.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={deletingId === transaction.id}
                        aria-label={t('transaction.table.actions.label', { ticker: transaction.ticker || '-', date: formatDateTime(transaction.date, locale) })}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => { onEdit(transaction); setOpenMenuId(null); }}
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
        <PaginationControls page={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
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
            <AlertDialogCancel variant="outline">{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              {t('transaction.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};


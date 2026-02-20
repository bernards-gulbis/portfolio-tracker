import { useState } from 'react';
import { Transaction } from '../api';
import { useDeleteTransaction } from '../hooks/useTransactions';
import { formatCurrency, formatDate, formatTransactionType, getDisplayValue } from '../utils/formatters';
import { DEFAULT_PAGE_SIZE, MAX_VISIBLE_PAGES } from '../constants/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { MoreVertical, PencilIcon, TrashIcon, ReceiptIcon, Trash2Icon } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TransactionTableProps {
  transactions: Transaction[];
  portfolioId: number;
  onEdit: (transaction: Transaction) => void;
  currentPage: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}


const TransactionTable = ({
  transactions,
  portfolioId,
  onEdit,
  currentPage,
  totalPages,
  total,
  onPageChange,
  isLoading
}: TransactionTableProps) => {
  const deleteTransaction = useDeleteTransaction();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setDeleteError(`Failed to delete transaction: ${errorMsg}`);
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

  if (transactions.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptIcon />
          </EmptyMedia>
          <EmptyTitle>No Transactions Yet</EmptyTitle>
          <EmptyDescription>
            Upload a CSV file or add transactions manually using the button above.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const startIndex = (currentPage - 1) * DEFAULT_PAGE_SIZE;
  const endIndex = Math.min(startIndex + transactions.length, total);

  return (
    <>
      {deleteError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground mb-3">
        Showing {startIndex + 1}-{endIndex} of {total} transactions
      </p>
      <div className="overflow-x-auto" data-table-container>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price per Share</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id} data-testid="transaction-row">
                <TableCell>{formatDate(transaction.date)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {formatTransactionType(transaction.type)}
                  </Badge>
                </TableCell>
                <TableCell>{transaction.ticker || '-'}</TableCell>
                <TableCell className="text-right">
                  {transaction.quantity !== null && transaction.quantity !== undefined ? transaction.quantity.toFixed(8) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {transaction.price_per_share !== null && transaction.price_per_share !== undefined ? formatCurrency(transaction.price_per_share) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(getDisplayValue(transaction))}
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
                        aria-label={`Actions for ${transaction.ticker || 'transaction'} on ${formatDate(transaction.date)}`}
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
                          Edit
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
                          {deletingId === transaction.id ? 'Deleting...' : 'Delete'}
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
        <Pagination className="mt-4">
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
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this transaction. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TransactionTable;

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '../hooks/useTransactions';
import { useDebounce } from '../hooks/useDebounce';
import { useParams } from 'react-router-dom';
import { usePortfolioStatus } from '../hooks/usePortfolioStatus';
import { Transaction, exportTransactionsCSV, getErrorMessage } from '../api';
import { TransactionTable } from './TransactionTable';
import { ImportCSVModal } from './ImportCSVModal';
import { TransactionModal } from './TransactionModal';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertTriangleIcon, Plus, MoreVertical, UploadIcon, DownloadIcon, ReceiptIcon } from 'lucide-react';

export const TransactionView = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const activePortfolioId = id ? Number(id) : null;
  const [currentPage, setCurrentPage] = useState(1);
  const [tickerSearch, setTickerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Track previous portfolio id as state so React can reset filters synchronously
  const [prevPortfolioId, setPrevPortfolioId] = useState(activePortfolioId);
  if (prevPortfolioId !== activePortfolioId) {
    setPrevPortfolioId(activePortfolioId);
    setCurrentPage(1);
    setTickerSearch('');
    setTypeFilter([]);
    setSortOrder('desc');
  }

  const debouncedTicker = useDebounce(tickerSearch, 150);
  const typeFilterKey = [...typeFilter].sort((a, b) => a.localeCompare(b)).join(',');

  // Track previous filter key as state to reset page when filters change
  const filterToken = `${debouncedTicker}|${typeFilterKey}|${sortOrder}`;
  const [prevFilterToken, setPrevFilterToken] = useState(filterToken);
  if (prevFilterToken !== filterToken) {
    setPrevFilterToken(filterToken);
    setCurrentPage(1);
  }

  const { data: paginatedData, isLoading, error } = useTransactions(
    activePortfolioId, currentPage, DEFAULT_PAGE_SIZE,
    debouncedTicker || undefined, typeFilter.length > 0 ? typeFilter : undefined,
    sortOrder
  );
  // Status carries the list of transactions the backend could not convert
  // to EUR (no eur_amount, no fx_rate, no historical rate). Surfacing them
  // here lets the user fix the offending row directly from the table.
  const { data: portfolioStatus } = usePortfolioStatus(activePortfolioId);
  const fxMissingTxIds = portfolioStatus?.fx_missing_tx_ids ?? [];
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const transactions = paginatedData?.transactions ?? [];
  const totalPages = paginatedData?.total_pages ?? 1;
  const total = paginatedData?.total ?? 0;
  const responsePage = paginatedData?.page ?? 1;
  const responsePageSize = paginatedData?.page_size ?? DEFAULT_PAGE_SIZE;

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsTransactionModalOpen(true);
  };

  const handleAddTransaction = () => {
    setEditingTransaction(undefined);
    setIsTransactionModalOpen(true);
  };

  const handleCloseTransactionModal = () => {
    setIsTransactionModalOpen(false);
    setEditingTransaction(undefined);
  };

  const handleExport = async () => {
    if (activePortfolioId == null) return;

    setIsExporting(true);
    setExportError(null);
    try {
      const blob = await exportTransactionsCSV(activePortfolioId);
      const url = globalThis.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `portfolio_${activePortfolioId}_transactions.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      globalThis.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(t('transaction.view.exportError', { message: getErrorMessage(err) }));
    } finally {
      setIsExporting(false);
    }
  };

  if (activePortfolioId == null) {
    return (
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <ReceiptIcon />
              </EmptyMedia>
              <EmptyTitle>{t('transaction.view.noPortfolio.title')}</EmptyTitle>
              <EmptyDescription>{t('transaction.view.noPortfolio.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !paginatedData) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('transaction.view.title')}</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <Skeleton className="h-4 w-48 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('transaction.view.title')}</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertDescription>{t('transaction.view.error', { message: getErrorMessage(error) })}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('transaction.view.title')}</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleAddTransaction}>
            <Plus className="h-4 w-4 mr-1" />
            {t('transaction.view.addButton')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label={t('transaction.view.actionsMenu')}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setIsImportModalOpen(true)}>
                  <UploadIcon />
                  {t('transaction.view.importCsv')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExport}
                  disabled={isExporting || transactions.length === 0}
                >
                  <DownloadIcon />
                  {isExporting ? t('transaction.view.exporting') : t('transaction.view.exportCsv')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <Separator />

      <CardContent className="pt-4">
        {exportError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{exportError}</AlertDescription>
          </Alert>
        )}
        <TransactionTable
          transactions={transactions}
          portfolioId={activePortfolioId}
          onEdit={handleEdit}
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          responsePage={responsePage}
          responsePageSize={responsePageSize}
          onPageChange={setCurrentPage}
          tickerSearch={tickerSearch}
          onTickerSearchChange={setTickerSearch}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          fxMissingTxIds={fxMissingTxIds}
        />
      </CardContent>

      <ImportCSVModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        portfolioId={activePortfolioId}
      />

      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={handleCloseTransactionModal}
        portfolioId={activePortfolioId}
        transaction={editingTransaction}
      />
    </Card>
  );
};


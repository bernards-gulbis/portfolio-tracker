import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransactions } from '../hooks/useTransactions';
import { useDebounce } from '../hooks/useDebounce';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { Transaction, exportTransactionsCSV, getErrorMessage } from '../api';
import TransactionTable from './TransactionTable';
import ImportCSVModal from './UploadCSVModal';
import TransactionModal from './TransactionModal';
import { DEFAULT_PAGE_SIZE } from '../constants/pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, UploadIcon, DownloadIcon } from 'lucide-react';

const TransactionView = () => {
  const { t } = useTranslation();
  const activePortfolioId = useActivePortfolioId();
  const [currentPage, setCurrentPage] = useState(1);
  const [tickerSearch, setTickerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const debouncedTicker = useDebounce(tickerSearch, 300);
  const { data: paginatedData, isLoading, isFetching, error } = useTransactions(
    activePortfolioId, currentPage, DEFAULT_PAGE_SIZE,
    debouncedTicker || undefined, typeFilter.length > 0 ? typeFilter : undefined,
    sortOrder
  );
  const gainByTxId = new Map<number, { gain: number; gainPct: number | null }>();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const transactions = paginatedData?.transactions || [];
  const totalPages = paginatedData?.total_pages || 1;
  const total = paginatedData?.total || 0;
  const responsePage = paginatedData?.page || 1;
  const responsePageSize = paginatedData?.page_size || DEFAULT_PAGE_SIZE;

  // Reset filters and page when portfolio changes
  useEffect(() => {
    setCurrentPage(1);
    setTickerSearch('');
    setTypeFilter([]);
    setSortOrder('desc');
  }, [activePortfolioId]);

  // Reset to page 1 when filters change
  const typeFilterKey = typeFilter.join(',');
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedTicker, typeFilterKey, sortOrder]);

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
    if (!activePortfolioId) return;

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

  if (!activePortfolioId) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">
            <h2 className="text-lg font-medium mb-1">{t('transaction.view.noPortfolio.title')}</h2>
            <p className="text-sm">{t('transaction.view.noPortfolio.description')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !paginatedData) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-normal">{t('transaction.view.title')}</CardTitle>
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
          <CardTitle className="text-lg font-normal">{t('transaction.view.title')}</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="py-8">
          <p className="text-center text-destructive text-sm">{t('transaction.view.error', { message: getErrorMessage(error) })}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-normal">{t('transaction.view.title')}</CardTitle>
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
                  disabled={isExporting || !transactions || transactions.length === 0}
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
          gainByTxId={gainByTxId}
          onEdit={handleEdit}
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          responsePage={responsePage}
          responsePageSize={responsePageSize}
          onPageChange={setCurrentPage}
          isLoading={isFetching}
          tickerSearch={tickerSearch}
          onTickerSearchChange={setTickerSearch}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
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

export default TransactionView;

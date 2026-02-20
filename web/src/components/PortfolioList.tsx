import { useState } from 'react';
import { usePortfolios, useDeletePortfolio } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';
import { Portfolio, getErrorMessage } from '../api';
import CreatePortfolioModal from './CreatePortfolioModal';
import EditPortfolioModal from './EditPortfolioModal';
import CopyPortfolioModal from './CopyPortfolioModal';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Plus, MoreVertical, PencilIcon, CopyIcon, TrashIcon, FolderOpenIcon, Trash2Icon } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const PortfolioList = () => {
  const { data: portfolios, isLoading, error } = usePortfolios();
  const { activePortfolioId, setActivePortfolioId } = usePortfolioContext();
  const deletePortfolio = useDeletePortfolio();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModalState, setEditModalState] = useState<{ isOpen: boolean; portfolio: Portfolio | null }>({
    isOpen: false,
    portfolio: null,
  });
  const [copyModalState, setCopyModalState] = useState<{ isOpen: boolean; portfolio: Portfolio | null }>({
    isOpen: false,
    portfolio: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; portfolioId: number | null }>({
    open: false,
    portfolioId: null,
  });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = (portfolioId: number) => {
    setDeleteConfirm({ open: true, portfolioId });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.portfolioId == null) return;
    try {
      await deletePortfolio.mutateAsync(deleteConfirm.portfolioId);
      if (activePortfolioId === deleteConfirm.portfolioId) {
        setActivePortfolioId(null);
      }
    } catch (error) {
      setDeleteError(`Failed to delete portfolio: ${getErrorMessage(error)}`);
    } finally {
      setDeleteConfirm({ open: false, portfolioId: null });
    }
  };

  const handleEdit = (portfolio: Portfolio) => {
    setEditModalState({ isOpen: true, portfolio });
  };

  const handleCopy = (portfolio: Portfolio) => {
    setCopyModalState({ isOpen: true, portfolio });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Portfolios</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-6 py-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Portfolios</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent>
          <p className="text-destructive text-sm text-center py-8">
            Error loading portfolios: {getErrorMessage(error)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Portfolios</CardTitle>
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </CardHeader>
        <Separator />

        <CardContent className="p-0">
          {deleteError && (
            <Alert variant="destructive" className="m-4">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          {portfolios && portfolios.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpenIcon />
                </EmptyMedia>
                <EmptyTitle>No Portfolios Yet</EmptyTitle>
                <EmptyDescription>
                  Get started by creating your first portfolio.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setIsModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Portfolio
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="divide-y divide-border">
              {portfolios?.map((portfolio) => (
                <li
                  key={portfolio.id}
                  className={cn(
                    'flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-muted/50 transition-colors',
                    activePortfolioId === portfolio.id && 'bg-muted'
                  )}
                  onClick={() => setActivePortfolioId(portfolio.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{portfolio.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(portfolio.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        disabled={deletePortfolio.isPending}
                        aria-label={`Actions for ${portfolio.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(portfolio); }}>
                          <PencilIcon />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopy(portfolio); }}>
                          <CopyIcon />
                          Copy
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(portfolio.id); }}
                          disabled={deletePortfolio.isPending}
                        >
                          <TrashIcon />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>

        <CreatePortfolioModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />

        {editModalState.portfolio && (
          <EditPortfolioModal
            isOpen={editModalState.isOpen}
            onClose={() => setEditModalState({ isOpen: false, portfolio: null })}
            portfolioId={editModalState.portfolio.id}
            currentName={editModalState.portfolio.name}
          />
        )}

        {copyModalState.portfolio && (
          <CopyPortfolioModal
            isOpen={copyModalState.isOpen}
            onClose={() => setCopyModalState({ isOpen: false, portfolio: null })}
            portfolioId={copyModalState.portfolio.id}
            portfolioName={copyModalState.portfolio.name}
          />
        )}
      </Card>

      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => !open && setDeleteConfirm({ open: false, portfolioId: null })}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete portfolio?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this portfolio and all its transactions. This action cannot be undone.
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

export default PortfolioList;

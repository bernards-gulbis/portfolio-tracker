import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDeletePortfolio } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';
import { toast } from 'sonner';
import { EditPortfolioModal } from './EditPortfolioModal';
import { CopyPortfolioModal } from './CopyPortfolioModal';
import { Button } from '@/components/ui/button';
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
import { MoreVertical, PencilIcon, CopyIcon, TrashIcon, Trash2Icon } from 'lucide-react';

interface PortfolioActionsProps {
  portfolioId: number;
  portfolioName: string;
}

export const PortfolioActions = ({ portfolioId, portfolioName }: PortfolioActionsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const deletePortfolio = useDeletePortfolio();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handleDeleteConfirm = async () => {
    if (deletePortfolio.isPending) return;
    try {
      await deletePortfolio.mutateAsync(portfolioId);
      navigate('/');
    } catch (err) {
      toast.error(t('portfolio.delete.errorToast', { message: getErrorMessage(err) }));
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('portfolio.list.item.actionsLabel', { name: portfolioName })}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setIsEditModalOpen(true)}>
              <PencilIcon />
              {t('portfolio.list.item.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsCopyModalOpen(true)}>
              <CopyIcon />
              {t('portfolio.list.item.copy')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={deletePortfolio.isPending}
            >
              <TrashIcon />
              {t('portfolio.list.item.delete')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditPortfolioModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        portfolioId={portfolioId}
        currentName={portfolioName}
      />

      <CopyPortfolioModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        portfolioId={portfolioId}
        portfolioName={portfolioName}
      />

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('portfolio.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('portfolio.delete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">{t('common.actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm} disabled={deletePortfolio.isPending}>
              {t('portfolio.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

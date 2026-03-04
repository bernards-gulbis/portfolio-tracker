import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronsUpDown, Plus, BriefcaseBusiness } from 'lucide-react';
import { usePortfolios } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PortfolioSwitcherProps {
  activePortfolioId: number | null;
  onCreateClick: () => void;
}

export const PortfolioSwitcher = ({ activePortfolioId, onCreateClick }: PortfolioSwitcherProps) => {
  const { t } = useTranslation();
  const { data: portfolios, isLoading, error } = usePortfolios();
  const [open, setOpen] = useState(false);

  const activePortfolio = portfolios?.find((p) => p.id === activePortfolioId);

  const renderPortfolioItems = () => {
    if (error) {
      return (
        <div className="px-2 py-1.5 text-xs text-destructive">
          {t('portfolio.list.error', { message: getErrorMessage(error) })}
        </div>
      );
    }
    if (portfolios && portfolios.length > 0) {
      return portfolios.map((portfolio) => (
        <DropdownMenuItem key={portfolio.id} asChild className="gap-2 p-2">
          <Link
            to={`/portfolios/${portfolio.id}`}
            onClick={() => setOpen(false)}
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-sm border">
              <BriefcaseBusiness className="h-4 w-4 shrink-0" />
            </div>
            <span className="truncate">{portfolio.name}</span>
          </Link>
        </DropdownMenuItem>
      ));
    }
    return (
      <div className="px-2 py-1.5 text-xs text-muted-foreground">
        {t('portfolio.list.empty.switcherHint')}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2 h-8">
          <BriefcaseBusiness className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium text-sm max-w-[160px]">
            {activePortfolio?.name ?? t('portfolio.list.title')}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        align="start"
        sideOffset={8}
      >
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {t('portfolio.list.title')}
        </DropdownMenuLabel>
        {renderPortfolioItems()}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 p-2"
          onClick={() => {
            setOpen(false);
            onCreateClick();
          }}
        >
          <div className="bg-background flex h-6 w-6 items-center justify-center rounded-md border">
            <Plus className="h-4 w-4" />
          </div>
          <span className="font-medium text-muted-foreground">{t('portfolio.list.createButton')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

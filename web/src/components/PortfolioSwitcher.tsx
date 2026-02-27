import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronsUpDown, Plus, BriefcaseBusiness } from 'lucide-react';
import { usePortfolios } from '../hooks/usePortfolios';
import { getErrorMessage } from '../api';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

const triggerClassName = [
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2',
  'text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding]',
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  'focus-visible:ring-2',
  'active:bg-sidebar-accent active:text-sidebar-accent-foreground',
  'disabled:pointer-events-none disabled:opacity-50',
  'aria-disabled:pointer-events-none aria-disabled:opacity-50',
  'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
  'h-12 cursor-pointer group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!',
  '[&>svg]:size-4 [&>svg]:shrink-0',
].join(' ');

interface PortfolioSwitcherProps {
  activePortfolioId: number | null;
  onCreateClick: () => void;
}

const PortfolioSwitcher = ({ activePortfolioId, onCreateClick }: PortfolioSwitcherProps) => {
  const { t } = useTranslation();
  const { data: portfolios, isLoading, error } = usePortfolios();
  const { isMobile } = useSidebar();
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
            <div className="flex size-6 items-center justify-center rounded-sm border">
              <BriefcaseBusiness className="size-4 shrink-0" />
            </div>
            <span className="truncate">{portfolio.name}</span>
          </Link>
        </DropdownMenuItem>
      ));
    }
    return (
      <div className="px-2 py-1.5 text-xs text-muted-foreground">
        {t('portfolio.list.empty.description')}
      </div>
    );
  };

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-4 w-28" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <button className={triggerClassName}>
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                <BriefcaseBusiness className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {activePortfolio?.name ?? t('portfolio.list.title')}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
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
              <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                <Plus className="size-4" />
              </div>
              <span className="font-medium text-muted-foreground">{t('portfolio.list.createButton')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default PortfolioSwitcher;

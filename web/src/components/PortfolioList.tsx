import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../hooks/useLocale';
import { usePortfolios } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';
import { getErrorMessage } from '../api';
import CreatePortfolioModal from './CreatePortfolioModal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { Plus, FolderOpenIcon } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const PortfolioList = () => {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: portfolios, isLoading, error } = usePortfolios();
  const { activePortfolioId, setActivePortfolioId } = usePortfolioContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{t('portfolio.list.title')}</SidebarGroupLabel>
        <SidebarMenu>
          {[1, 2, 3].map((i) => (
            <SidebarMenuItem key={i}>
              <div className="flex items-center gap-3 px-2 py-1.5">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    );
  }

  if (error) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>{t('portfolio.list.title')}</SidebarGroupLabel>
        <p className="px-2 py-4 text-destructive text-sm text-center">
          {t('portfolio.list.error', { message: getErrorMessage(error) })}
        </p>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t('portfolio.list.title')}</SidebarGroupLabel>
        <SidebarGroupAction title={t('portfolio.list.newButton')} onClick={() => setIsModalOpen(true)}>
          <Plus />
          <span className="sr-only">{t('portfolio.list.newButton')}</span>
        </SidebarGroupAction>

        {portfolios && portfolios.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpenIcon />
              </EmptyMedia>
              <EmptyTitle>{t('portfolio.list.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('portfolio.list.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('portfolio.list.empty.newButton')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <SidebarMenu>
            {portfolios?.map((portfolio) => (
              <SidebarMenuItem key={portfolio.id}>
                <SidebarMenuButton
                  isActive={activePortfolioId === portfolio.id}
                  onClick={() => setActivePortfolioId(portfolio.id)}
                  className="flex flex-col items-start h-auto py-2"
                >
                  <span className="font-medium truncate w-full">{portfolio.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('portfolio.list.item.created')} {new Date(portfolio.created_at).toLocaleDateString(locale)}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroup>

      <CreatePortfolioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default PortfolioList;

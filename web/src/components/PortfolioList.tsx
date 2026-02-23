import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { usePortfolios } from '../hooks/usePortfolios';
import { usePortfolioContext } from '../context/PortfolioContext';
import { getErrorMessage } from '../api';
import CreatePortfolioModal from './CreatePortfolioModal';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { Plus, ChevronRight, BriefcaseBusiness } from 'lucide-react';

const PortfolioList = () => {
  const { t } = useTranslation();
  const { data: portfolios, isLoading, error } = usePortfolios();
  const { activePortfolioId, setActivePortfolioId } = usePortfolioContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t('portfolio.list.title')}</SidebarGroupLabel>
        <SidebarGroupAction title={t('portfolio.list.newButton')} onClick={() => setIsModalOpen(true)}>
          <Plus />
          <span className="sr-only">{t('portfolio.list.newButton')}</span>
        </SidebarGroupAction>
        <SidebarMenu>
          <CollapsiblePrimitive.Root defaultOpen className="group/collapsible">
            <SidebarMenuItem>
              <CollapsiblePrimitive.Trigger asChild>
                <SidebarMenuButton>
                  <BriefcaseBusiness />
                  <span>{t('portfolio.list.title')}</span>
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsiblePrimitive.Trigger>
              <CollapsiblePrimitive.Content>
                <SidebarMenuSub>
                  {isLoading ? (
                    [1, 2, 3].map((i) => (
                      <SidebarMenuSubItem key={i}>
                        <div className="px-2 py-1.5">
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </SidebarMenuSubItem>
                    ))
                  ) : error ? (
                    <SidebarMenuSubItem>
                      <span className="px-2 py-1.5 text-destructive text-xs">
                        {t('portfolio.list.error', { message: getErrorMessage(error) })}
                      </span>
                    </SidebarMenuSubItem>
                  ) : portfolios && portfolios.length === 0 ? (
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton onClick={() => setIsModalOpen(true)}>
                        <Plus className="h-3 w-3" />
                        <span>{t('portfolio.list.empty.newButton')}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ) : (
                    portfolios?.map((portfolio) => (
                      <SidebarMenuSubItem key={portfolio.id}>
                        <SidebarMenuSubButton
                          isActive={activePortfolioId === portfolio.id}
                          onClick={() => setActivePortfolioId(portfolio.id)}
                        >
                          <span className="truncate">{portfolio.name}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))
                  )}
                </SidebarMenuSub>
              </CollapsiblePrimitive.Content>
            </SidebarMenuItem>
          </CollapsiblePrimitive.Root>
        </SidebarMenu>
      </SidebarGroup>

      <CreatePortfolioModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default PortfolioList;

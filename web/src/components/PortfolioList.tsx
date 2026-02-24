import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { usePortfolios } from '../hooks/usePortfolios';
import { useActivePortfolioId } from '../hooks/useActivePortfolioId';
import { getErrorMessage } from '../api';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { ChevronRight, BriefcaseBusiness } from 'lucide-react';

const PortfolioList = () => {
  const { t } = useTranslation();
  const { data: portfolios, isLoading, error } = usePortfolios();
  const activePortfolioId = useActivePortfolioId();

  return (
      <SidebarGroup>
        <SidebarGroupLabel>{t('portfolio.list.title')}</SidebarGroupLabel>
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
                      <span className="px-2 py-1.5 text-muted-foreground text-xs">
                        {t('portfolio.list.empty.description')}
                      </span>
                    </SidebarMenuSubItem>
                  ) : (
                    portfolios?.map((portfolio) => (
                      <SidebarMenuSubItem key={portfolio.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={activePortfolioId === portfolio.id}
                        >
                          <Link to={`/portfolios/${portfolio.id}`}>
                            <span className="truncate">{portfolio.name}</span>
                          </Link>
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
  );
};

export default PortfolioList;

import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortfolios } from '../hooks/usePortfolios';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

export const AppBreadcrumbs = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { id } = useParams<{ id: string }>();
  const { data: portfolios } = usePortfolios();

  if (pathname === '/aggregate') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{t('aggregate.title')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname.startsWith('/settings')) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{t('settings.title')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (id) {
    const portfolioName = portfolios?.find((p) => p.id === Number(id))?.name;
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{portfolioName ?? `#${id}`}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{t('app.sidebar.dashboard')}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
};

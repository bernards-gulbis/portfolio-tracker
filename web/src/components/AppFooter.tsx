import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '../constants/app';

export function AppFooter({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={cn('space-y-1 px-6 py-3 text-xs text-muted-foreground', className)}>
      <div className="flex flex-wrap items-center gap-x-1">
        <span>
          {t('app.footer.dataAttribution')}{' '}
          <a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            {t('app.footer.dataSource')}
          </a>
        </span>
        <span aria-hidden="true">·</span>
        <span>{t('app.footer.copyright', { year })}</span>
        <span aria-hidden="true">·</span>
        <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          {t('app.footer.license')}
        </a>
        <span className="ml-auto">{t('app.version', { version: APP_VERSION })}</span>
      </div>
      <p className="text-[0.65rem] text-muted-foreground/60">{t('app.footer.disclaimer')}</p>
    </footer>
  );
}

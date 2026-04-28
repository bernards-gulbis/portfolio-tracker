import { useTranslation, Trans } from 'react-i18next';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '../constants/app';

export function AppFooter({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className={cn('space-y-1 px-6 py-3 text-xs text-muted-foreground', className)}>
      <div className="flex flex-wrap items-center gap-x-1">
        <span>
          <Trans i18nKey="app.footer.dataAttribution" components={{ provider: <a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">link</a> }} />
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <Trans i18nKey="app.footer.copyright" values={{ year }} components={{ author: <a href="https://bg.id.lv/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">link</a> }} />
        </span>
        <span className="ml-auto">{t('app.version', { version: APP_VERSION })}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t('app.footer.disclaimer')}</p>
    </footer>
  );
}

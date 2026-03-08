import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { APP_VERSION } from '../constants/app';

export function AppFooter({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <footer className={cn('px-6 py-3 text-xs text-muted-foreground', className)}>
      <p className="text-center text-[0.65rem] text-muted-foreground/70">
        {t('app.footer.dataAttribution')}{' '}
        <a href="https://finance.yahoo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          {t('app.footer.dataSource')}
        </a>
        {'. '}
        {t('app.footer.disclaimer')}
      </p>
      <Separator className="my-2" />
      <div className="flex items-baseline justify-between">
        <span>
          {t('app.footer.copyright', { year: new Date().getFullYear() })}
          {' · '}
          <a href="https://opensource.org/license/mit" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
            {t('app.footer.license')}
          </a>
        </span>
        <span>{t('app.version', { version: APP_VERSION })}</span>
      </div>
    </footer>
  );
}

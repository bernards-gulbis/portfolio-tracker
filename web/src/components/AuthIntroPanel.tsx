import { Coins, Receipt, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const FEATURES = [
  { id: 'valuations', Icon: TrendingUp },
  { id: 'returns', Icon: Coins },
  { id: 'tax', Icon: Receipt },
] as const;

/**
 * Explains what the app is to someone who has never seen it before.
 * Rendered beside the sign-in form on desktop and above it on mobile,
 * where the feature list is dropped to keep the form near the top.
 */
export function AuthIntroPanel({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex flex-col justify-center gap-6 bg-muted p-6 md:p-8', className)}>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          {t('auth.intro.headline')}
        </h1>
        <p className="text-balance text-sm text-muted-foreground">{t('auth.intro.tagline')}</p>
      </div>

      <ul className="hidden flex-col gap-4 md:flex">
        {FEATURES.map(({ id, Icon }) => (
          <li key={id} className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium leading-none">
                {t(`auth.intro.features.${id}.title`)}
              </p>
              <p className="text-xs leading-snug text-muted-foreground">
                {t(`auth.intro.features.${id}.description`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {/* Not `secondary`: that sits on top of the panel's own bg-muted and disappears. */}
      <Badge>{t('auth.intro.freeBadge')}</Badge>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoIcon, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface InfoBannerProps {
  children: ReactNode;
  onDismiss?: () => void;
}

export const InfoBanner = ({ children, onDismiss }: InfoBannerProps) => {
  const { t } = useTranslation();
  return (
    <Alert>
      <InfoIcon className="h-4 w-4" />
      <AlertDescription>{children}</AlertDescription>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="absolute top-1/2 -translate-y-1/2 right-2 opacity-70 hover:opacity-100"
          aria-label={t('common.actions.dismiss')}
        >
          <X />
        </Button>
      )}
    </Alert>
  );
};

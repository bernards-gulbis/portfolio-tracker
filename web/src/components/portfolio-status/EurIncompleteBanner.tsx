import { useTranslation } from 'react-i18next';
import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface EurIncompleteBannerProps {
  missingCount: number;
  onGoToTransactions: () => void;
}

export const EurIncompleteBanner = ({ missingCount, onGoToTransactions }: EurIncompleteBannerProps) => {
  const { t } = useTranslation();
  return (
    <Alert>
      <InfoIcon className="h-4 w-4" />
      <AlertDescription>
        <span>
          {t('status.fxIncomplete', { count: missingCount })}{' '}
          <Button
            variant="link"
            className="h-auto p-0 underline font-medium"
            onClick={onGoToTransactions}
          >
            {t('status.fxIncompleteCta')}
          </Button>.
        </span>
      </AlertDescription>
    </Alert>
  );
};

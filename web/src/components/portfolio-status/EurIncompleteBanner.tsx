import { useTranslation } from 'react-i18next';
import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
          <button
            type="button"
            className="underline font-medium cursor-pointer"
            onClick={onGoToTransactions}
          >
            {t('status.fxIncompleteCta')}
          </button>.
        </span>
      </AlertDescription>
    </Alert>
  );
};

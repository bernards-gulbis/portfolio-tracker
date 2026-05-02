import { Trans } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { InfoBanner } from './InfoBanner';

interface EurIncompleteBannerProps {
  missingCount: number;
  onGoToTransactions: () => void;
}

export const EurIncompleteBanner = ({ missingCount, onGoToTransactions }: EurIncompleteBannerProps) => (
  <InfoBanner>
    <Trans
      i18nKey="status.fxIncomplete"
      count={missingCount}
      components={{
        cta: (
          <Button
            variant="link"
            className="h-auto p-0 underline font-medium"
            onClick={onGoToTransactions}
          />
        ),
      }}
    />
  </InfoBanner>
);

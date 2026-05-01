import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface InfoBannerProps {
  children: ReactNode;
}

export const InfoBanner = ({ children }: InfoBannerProps) => (
  <Alert>
    <InfoIcon className="h-4 w-4" />
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

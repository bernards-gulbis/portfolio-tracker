import type { ReactNode } from 'react';
import { InfoIcon, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface InfoBannerProps {
  children: ReactNode;
  onDismiss?: () => void;
}

export const InfoBanner = ({ children, onDismiss }: InfoBannerProps) => (
  <Alert>
    <InfoIcon className="h-4 w-4" />
    <AlertDescription>{children}</AlertDescription>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="absolute top-1/2 -translate-y-1/2 right-2 cursor-pointer opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </Alert>
);

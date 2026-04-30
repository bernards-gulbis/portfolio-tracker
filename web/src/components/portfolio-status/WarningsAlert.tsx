import { useTranslation } from 'react-i18next';
import { AlertTriangleIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '../../utils/formatters';
import type { TransactionWarning } from '../../api';

interface WarningsAlertProps {
  warnings: TransactionWarning[];
  locale: string;
}

export const WarningsAlert = ({ warnings, locale }: WarningsAlertProps) => {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon className="h-4 w-4" />
      <AlertDescription>
        <p className="font-medium">{t('status.transactionWarnings')}</p>
        <ul className="list-disc pl-4 mt-1 text-sm">
          {warnings.map((w, i) => {
            // Backend sends params as Record<string, string>, but i18next's
            // plural resolver needs ``count`` as a number to pick _one / _other.
            const interpolation: Record<string, unknown> = {
              ...w.params,
              date: formatDateTime(w.date, locale),
            };
            if (typeof interpolation.count === 'string') {
              const n = Number(interpolation.count);
              if (Number.isFinite(n)) interpolation.count = n;
            }
            // Index disambiguates warnings sharing the same (code, date) —
            // e.g., two fx-fallback warnings on the same midnight timestamp.
            return (
              <li key={`${w.code}-${w.date}-${i}`}>
                {(t as (key: string, options?: Record<string, unknown>) => string)(
                  `status.warnings.${w.code}`,
                  interpolation,
                )}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

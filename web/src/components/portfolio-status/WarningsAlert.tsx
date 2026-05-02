import { useTranslation } from 'react-i18next';
import { AlertTriangleIcon } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';

import type { TransactionWarning } from '../../api';
import { formatDateTime } from '../../utils/formatters';

interface WarningsAlertProps {
  warnings: TransactionWarning[];
  locale: string;
}

function buildInterpolation(w: TransactionWarning, locale: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...w.params, date: formatDateTime(w.date, locale) };
  // i18next's plural resolver needs ``count`` as a number to pick _one / _other.
  if (typeof out.count === 'string') {
    const n = Number(out.count);
    if (Number.isFinite(n)) out.count = n;
  }
  return out;
}

export const WarningsAlert = ({ warnings, locale }: WarningsAlertProps) => {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  const tDynamic = t as (key: string, options?: Record<string, unknown>) => string;
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon className="h-4 w-4" />
      <AlertDescription>
        <p className="font-medium">{t('status.transactionWarnings')}</p>
        <ul className="list-disc pl-4 mt-1 text-sm">
          {warnings.map((w, i) => (
            // Index disambiguates warnings sharing the same (code, date).
            <li key={`${w.code}-${w.date}-${i}`}>
              {tDynamic(`status.warnings.${w.code}`, buildInterpolation(w, locale))}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

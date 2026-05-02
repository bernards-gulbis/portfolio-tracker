import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

interface DaysHeldLabels {
  d: string;
  m: string;
  y: string;
}

export const useDaysHeldLabels = (): DaysHeldLabels => {
  const { t } = useTranslation();
  return useMemo(() => ({
    d: t('common.daysShort'),
    m: t('common.monthsShort'),
    y: t('common.yearsShort'),
  }), [t]);
};

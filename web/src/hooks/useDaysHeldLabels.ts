import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';

export const useDaysHeldLabels = () => {
  const { t } = useTranslation();
  return useMemo(() => ({
    d: t('common.daysShort'),
    m: t('common.monthsShort'),
    y: t('common.yearsShort'),
  }), [t]);
};

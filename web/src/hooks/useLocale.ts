import { useTranslation } from 'react-i18next';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  lv: 'lv-LV',
};

/**
 * Returns the BCP 47 locale string for the active language (e.g. 'lv-LV').
 * Subscribes to i18n language changes so components re-render when the locale
 * switches, keeping Intl.NumberFormat / toLocaleDateString output in sync.
 */
export const useLocale = (): string => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  return LOCALE_MAP[lang] ?? 'en-US';
};

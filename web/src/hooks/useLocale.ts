import { useTranslation } from 'react-i18next';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  lv: 'lv-LV',
};

/**
 * BCP 47 locale string for the active language. Subscribes to i18n language changes
 * so Intl.NumberFormat / toLocaleDateString output stays in sync on switch.
 */
export const useLocale = (): string => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split('-')[0] ?? 'en';
  return LOCALE_MAP[lang] ?? 'en-US';
};

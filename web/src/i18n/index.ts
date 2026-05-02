import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import lv from './locales/lv';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      lv: { translation: lv },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'lv'],
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'pt_language',
    },
    interpolation: { escapeValue: false },
  });

export const SUPPORTED_LANGUAGES = ['en', 'lv'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/** Resolve the current i18n language to a validated SupportedLanguage. */
export const getCurrentLanguage = (): SupportedLanguage => {
  const raw = i18n.language?.split('-')[0] ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(raw) ? (raw as SupportedLanguage) : 'en';
};

export default i18n;

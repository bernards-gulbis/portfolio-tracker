import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/index';

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();
  const rawLang = i18n.language?.split('-')[0] ?? 'en';
  const currentLang: SupportedLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang)
    ? (rawLang as SupportedLanguage)
    : 'en';

  const handleSelect = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('language.switchLabel')} className="min-w-[42px] px-2 font-medium">
          {currentLang.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => handleSelect(lang)}
            className={lang === currentLang ? 'font-semibold' : ''}
          >
            {t(`language.${lang}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SECTIONS, type SettingsSection } from './schemas';

export const SettingsNav = ({
  active,
  onChange,
}: {
  active: SettingsSection;
  onChange: (section: SettingsSection) => void;
}) => {
  const { t } = useTranslation();

  return (
    <nav className="flex flex-row gap-1 md:flex-col md:w-48 md:shrink-0">
      {SECTIONS.map((section) => (
        <Button
          key={section}
          variant="ghost"
          className={cn('justify-start', active === section && 'bg-muted')}
          onClick={() => onChange(section)}
        >
          {t(`settings.${section}.tab`)}
        </Button>
      ))}
    </nav>
  );
};

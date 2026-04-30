import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLastVisitedPortfolio } from '../hooks/useLastVisitedPortfolio';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft } from 'lucide-react';
import type { FC } from 'react';
import { ProfileSection } from './settings/ProfileSection';
import { PasswordSection } from './settings/PasswordSection';
import { TaxSection } from './settings/TaxSection';
import { AccountSection } from './settings/AccountSection';
import { SettingsNav } from './settings/SettingsNav';
import type { SettingsSection } from './settings/schemas';

// Re-exports preserved for backward compatibility (tests import these by name).
export { ProfileSection } from './settings/ProfileSection';
export { PasswordSection } from './settings/PasswordSection';
export { TaxSection } from './settings/TaxSection';
export { AccountSection } from './settings/AccountSection';

const SECTION_COMPONENTS: Record<SettingsSection, FC> = {
  profile: ProfileSection,
  password: PasswordSection,
  tax: TaxSection,
  account: AccountSection,
};

const SectionContent = ({ section }: { section: SettingsSection }) => {
  const { t } = useTranslation();
  const Component = SECTION_COMPONENTS[section];

  return (
    <div className="flex-1 min-w-0 space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t(`settings.${section}.tab`)}</h2>
        <p className="text-sm text-muted-foreground">{t(`settings.${section}.description`)}</p>
      </div>
      <Separator />
      <Component />
    </div>
  );
};

export const SettingsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastVisited = useLastVisitedPortfolio();
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  const handleBack = () => {
    const lastId = lastVisited.get();
    if (lastId == null) {
      navigate('/');
    } else {
      navigate(`/portfolios/${lastId}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="gap-1 text-muted-foreground hover:text-foreground mb-2 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('settings.backToPortfolio')}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings.description')}</p>
      </div>
      <Separator className="mb-4" />
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SettingsNav active={activeSection} onChange={setActiveSection} />
        <SectionContent section={activeSection} />
      </div>
    </div>
  );
};

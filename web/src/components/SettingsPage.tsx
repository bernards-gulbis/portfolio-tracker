import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
import { useUpdateProfile, useChangePassword, useUpdateTaxRate, useCloseAccount } from '../hooks/useAuth';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { getErrorMessage } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Info, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsSection = 'profile' | 'password' | 'tax' | 'account';

const SECTIONS: SettingsSection[] = ['profile', 'password', 'tax', 'account'];

// ================== Schemas ==================

const profileSchema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.trim().length < 1) {
      ctx.addIssue({ code: "custom", message: i18n.t('settings.validation.nameRequired') });
    } else if (val.trim().length > 255) {
      ctx.addIssue({ code: "custom", message: i18n.t('settings.validation.nameTooLong') });
    }
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  newPassword: z.string().superRefine((val, ctx) => {
    if (val.length < 8) {
      ctx.addIssue({ code: "custom", message: i18n.t('settings.validation.passwordMinLength') });
    }
  }),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.newPassword.length >= 8 && data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      message: i18n.t('settings.validation.passwordsDoNotMatch'),
      path: ['confirmPassword'],
    });
  }
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

const closeAccountPasswordSchema = z.object({
  password: z.string().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: "custom", message: i18n.t('settings.validation.passwordRequired') });
    }
  }),
});

const closeAccountConfirmSchema = z.object({
  confirmation: z.string().superRefine((val, ctx) => {
    if (val !== 'DELETE') {
      ctx.addIssue({ code: "custom", message: i18n.t('settings.validation.confirmationRequired') });
    }
  }),
});

type CloseAccountPasswordValues = z.infer<typeof closeAccountPasswordSchema>;
type CloseAccountConfirmValues = z.infer<typeof closeAccountConfirmSchema>;

// ================== Unsaved changes warning ==================

/** Warns the user via the browser's native beforeunload dialog when form state is dirty. */
const useWarnUnsavedChanges = (isDirty: boolean) => {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    globalThis.window.addEventListener('beforeunload', handler);
    return () => globalThis.window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
};

// ================== Nav ==================

const SettingsNav = ({
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
          className={cn(
            'justify-start',
            active === section && 'bg-muted',
          )}
          onClick={() => onChange(section)}
        >
          {t(`settings.${section}.tab`)}
        </Button>
      ))}
    </nav>
  );
};

// ================== Profile section ==================

export const ProfileSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  useWarnUnsavedChanges(form.formState.isDirty);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({ name: values.name.trim() });
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="settings-name">{t('settings.profile.nameLabel')}</FieldLabel>
              <Input
                {...field}
                id="settings-name"
                placeholder={t('settings.profile.namePlaceholder')}
                autoComplete="name"
                className="max-w-md"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor="settings-email">{t('settings.profile.emailLabel')}</FieldLabel>
          <Input
            id="settings-email"
            value={user?.email ?? ''}
            disabled
            readOnly
            className="max-w-md"
          />
        </Field>
        {form.formState.errors.root && (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending && <Spinner />}
          {t('settings.profile.submit')}
        </Button>
      </FieldGroup>
    </form>
  );
};

// ================== Password section ==================

export const PasswordSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const changePassword = useChangePassword();
  const isOauthUser = (user?.oauth_providers?.length ?? 0) > 0;

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useWarnUnsavedChanges(form.formState.isDirty);

  const onSubmit = async (values: PasswordFormValues) => {
    try {
      await changePassword.mutateAsync({ password: values.newPassword });
      form.reset({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      {isOauthUser && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t('settings.password.oauthNote')}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="newPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="settings-new-password">{t('settings.password.newPasswordLabel')}</FieldLabel>
                <Input
                  {...field}
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  className="max-w-md"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="settings-confirm-password">{t('settings.password.confirmPasswordLabel')}</FieldLabel>
                <Input
                  {...field}
                  id="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="max-w-md"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {form.formState.errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending && <Spinner />}
            {isOauthUser ? t('settings.password.submitOauth') : t('settings.password.submit')}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
};

// ================== Tax section ==================

const taxSchema = z.object({
  taxRate: z.number()
    .min(0, { message: i18n.t('settings.validation.taxRateMin') })
    .max(100, { message: i18n.t('settings.validation.taxRateMax') }),
});

type TaxFormValues = z.infer<typeof taxSchema>;

export const TaxSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const updateTaxRate = useUpdateTaxRate();

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxSchema),
    defaultValues: { taxRate: (user?.tax_rate ?? 0.255) * 100 },
  });

  useWarnUnsavedChanges(form.formState.isDirty);

  const onSubmit = async (values: TaxFormValues) => {
    try {
      await updateTaxRate.mutateAsync({ tax_rate: values.taxRate / 100 });
    } catch (err) {
      form.setError('root', { message: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t('settings.tax.taxExplanation')}</AlertDescription>
      </Alert>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="taxRate"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="settings-tax-rate">{t('settings.tax.rateLabel')}</FieldLabel>
                <Input
                  {...field}
                  id="settings-tax-rate"
                  type="number"
                  step="0.1"
                  className="max-w-md"
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {form.formState.errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={updateTaxRate.isPending}>
            {updateTaxRate.isPending && <Spinner />}
            {t('settings.tax.submit')}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
};

// ================== Account section ==================

export const AccountSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const closeAccountMutation = useCloseAccount();
  const isOauthUser = (user?.oauth_providers?.length ?? 0) > 0;

  const passwordForm = useForm<CloseAccountPasswordValues>({
    resolver: zodResolver(closeAccountPasswordSchema),
    defaultValues: { password: '' },
  });

  const confirmForm = useForm<CloseAccountConfirmValues>({
    resolver: zodResolver(closeAccountConfirmSchema),
    defaultValues: { confirmation: '' },
  });

  const onPasswordSubmit = async (values: CloseAccountPasswordValues) => {
    try {
      await closeAccountMutation.mutateAsync({ password: values.password });
    } catch (err) {
      passwordForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  const onConfirmSubmit = async (values: CloseAccountConfirmValues) => {
    try {
      await closeAccountMutation.mutateAsync({ confirmation: values.confirmation });
    } catch (err) {
      confirmForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  return (
    <div className="rounded-lg border border-destructive/50 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-destructive">{t('settings.account.dangerZone')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.account.closeDescription')}</p>
      </div>

      {isOauthUser ? (
        <form onSubmit={confirmForm.handleSubmit(onConfirmSubmit)}>
          <FieldGroup>
            <Controller
              name="confirmation"
              control={confirmForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="settings-close-confirmation">{t('settings.account.confirmationLabel')}</FieldLabel>
                  <Input
                    {...field}
                    id="settings-close-confirmation"
                    placeholder={t('settings.account.confirmationPlaceholder')}
                    autoComplete="off"
                    className="max-w-md"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {confirmForm.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{confirmForm.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" variant="destructive" disabled={closeAccountMutation.isPending}>
              {closeAccountMutation.isPending && <Spinner />}
              {t('settings.account.submit')}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid || undefined}>
                  <FieldLabel htmlFor="settings-close-password">{t('settings.account.passwordLabel')}</FieldLabel>
                  <Input
                    {...field}
                    id="settings-close-password"
                    type="password"
                    autoComplete="current-password"
                    className="max-w-md"
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {passwordForm.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{passwordForm.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" variant="destructive" disabled={closeAccountMutation.isPending}>
              {closeAccountMutation.isPending && <Spinner />}
              {t('settings.account.submit')}
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
};

// ================== Section Content ==================

const SECTION_COMPONENTS: Record<SettingsSection, React.FC> = {
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

// ================== Page ==================

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { goToPortfolio, activePortfolioId, goToFirstPortfolio } = useNavigation();
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  const handleBack = () => {
    if (activePortfolioId === null) {
      goToFirstPortfolio();
    } else {
      goToPortfolio(activePortfolioId);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('settings.backToPortfolio')}
        </button>
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


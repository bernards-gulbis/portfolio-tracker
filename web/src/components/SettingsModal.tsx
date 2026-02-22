import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { useTranslation } from 'react-i18next';
import { useUpdateProfile, useChangePassword } from '../hooks/useAuth';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ================== Profile schema ==================

const profileSchema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i18n.t('settings.validation.nameRequired') });
    } else if (val.length > 255) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i18n.t('settings.validation.nameTooLong') });
    }
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

// ================== Password schema ==================

const passwordSchema = z.object({
  newPassword: z.string().superRefine((val, ctx) => {
    if (val.length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: i18n.t('settings.validation.passwordMinLength') });
    }
  }),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.newPassword.length >= 8 && data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: i18n.t('settings.validation.passwordsDoNotMatch'),
      path: ['confirmPassword'],
    });
  }
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

// ================== Props ==================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ================== Component ==================

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const isOauthUser = (user?.oauth_providers?.length ?? 0) > 0;

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const { reset: resetProfile } = profileForm;
  const { reset: resetPassword } = passwordForm;

  useEffect(() => {
    if (isOpen) {
      resetProfile({ name: user?.name ?? '' });
      resetPassword({ newPassword: '', confirmPassword: '' });
    }
  }, [isOpen, user?.name, resetProfile, resetPassword]);

  const onProfileSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({ name: values.name.trim() });
      onClose();
    } catch (err) {
      profileForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    try {
      await changePassword.mutateAsync({ password: values.newPassword });
      resetPassword({ newPassword: '', confirmPassword: '' });
    } catch (err) {
      passwordForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleClose = () => {
    resetProfile({ name: user?.name ?? '' });
    resetPassword({ newPassword: '', confirmPassword: '' });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('settings.title')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">{t('settings.profile.tab')}</TabsTrigger>
            <TabsTrigger value="password">{t('settings.password.tab')}</TabsTrigger>
          </TabsList>

          {/* Profile tab */}
          <TabsContent value="profile">
            <form id="settings-profile-form" onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <FieldGroup className="py-4">
                <Controller
                  name="name"
                  control={profileForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="settings-name">{t('settings.profile.nameLabel')}</FieldLabel>
                      <Input
                        {...field}
                        id="settings-name"
                        placeholder={t('settings.profile.namePlaceholder')}
                        autoComplete="name"
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
                  />
                </Field>
                {profileForm.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertDescription>{profileForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </form>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={updateProfile.isPending}
              >
                {t('settings.profile.cancel')}
              </Button>
              <Button
                type="submit"
                form="settings-profile-form"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? t('settings.profile.submitting') : t('settings.profile.submit')}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Password tab */}
          <TabsContent value="password">
            {isOauthUser && (
              <p className="text-sm text-muted-foreground mt-4">
                {t('settings.password.oauthNote')}
              </p>
            )}
            <form id="settings-password-form" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
              <FieldGroup className="py-4">
                <Controller
                  name="newPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="settings-new-password">{t('settings.password.newPasswordLabel')}</FieldLabel>
                      <Input
                        {...field}
                        id="settings-new-password"
                        type="password"
                        autoComplete="new-password"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="confirmPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="settings-confirm-password">{t('settings.password.confirmPasswordLabel')}</FieldLabel>
                      <Input
                        {...field}
                        id="settings-confirm-password"
                        type="password"
                        autoComplete="new-password"
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
              </FieldGroup>
            </form>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={changePassword.isPending}
              >
                {t('settings.password.cancel')}
              </Button>
              <Button
                type="submit"
                form="settings-password-form"
                disabled={changePassword.isPending}
              >
                {changePassword.isPending
                  ? t('settings.password.submitting')
                  : isOauthUser
                    ? t('settings.password.submitOauth')
                    : t('settings.password.submit')}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useUpdateProfile } from '../../hooks/useAuth';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { profileSchema, type ProfileFormValues } from './schemas';
import { useWarnUnsavedChanges } from './useWarnUnsavedChanges';

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

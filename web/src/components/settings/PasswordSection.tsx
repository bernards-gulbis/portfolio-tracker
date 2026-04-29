import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useChangePassword } from '../../hooks/useAuth';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Info } from 'lucide-react';
import { passwordSchema, type PasswordFormValues } from './schemas';
import { useWarnUnsavedChanges } from './useWarnUnsavedChanges';

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

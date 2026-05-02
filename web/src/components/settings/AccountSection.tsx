import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCloseAccount } from '../../hooks/useAuth';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  closeAccountConfirmSchema,
  closeAccountPasswordSchema,
  type CloseAccountConfirmValues,
  type CloseAccountPasswordValues,
} from './schemas';

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

  const isPending = closeAccountMutation.isPending;
  const submitLabel = t('settings.account.submit');

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
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Spinner />}
              {submitLabel}
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
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending && <Spinner />}
              {submitLabel}
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
};

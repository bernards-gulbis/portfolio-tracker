import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import i18n from '../i18n/index';
import { toast } from 'sonner';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getGoogleAuthorizeUrl, getErrorMessage } from '../api';
import { useLogin, useRegister } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

const emailValidator = z.email();

const loginSchema = z.object({
  email: z.string().superRefine((val, ctx) => {
    if (!emailValidator.safeParse(val).success) {
      ctx.addIssue({ code: "custom", message: i18n.t('auth.validation.invalidEmail') });
    }
  }),
  password: z.string().superRefine((val, ctx) => {
    if (val.length < 1) {
      ctx.addIssue({ code: "custom", message: i18n.t('auth.validation.passwordRequired') });
    }
  }),
});

const registerSchema = z.object({
  name: z.string().superRefine((val, ctx) => {
    if (val.trim().length < 1) {
      ctx.addIssue({ code: "custom", message: i18n.t('auth.validation.nameRequired') });
    }
  }),
  email: z.string().superRefine((val, ctx) => {
    if (!emailValidator.safeParse(val).success) {
      ctx.addIssue({ code: "custom", message: i18n.t('auth.validation.invalidEmail') });
    }
  }),
  password: z.string().superRefine((val, ctx) => {
    if (val.length < 8) {
      ctx.addIssue({ code: "custom", message: i18n.t('auth.validation.passwordMinLength') });
    }
  }),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export const LoginPage = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [googleLoading, setGoogleLoading] = useState(false);

  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const translateApiError = (err: unknown): string => {
    const raw = getErrorMessage(err);
    const key = `auth.apiErrors.${raw}` as const;
    const translated = t(key as never);
    return String(translated) === key ? raw : String(translated);
  };

  const handleLogin = async (values: LoginValues) => {
    try {
      await loginMutation.mutateAsync({ username: values.email, password: values.password });
    } catch (err) {
      loginForm.setError('root', { message: translateApiError(err) });
    }
  };

  const handleRegister = async (values: RegisterValues) => {
    try {
      await registerMutation.mutateAsync({ name: values.name, email: values.email, password: values.password });
      toast.success(t('auth.register.successToast'));
      loginForm.reset({ email: values.email, password: '' });
      setMode('login');
    } catch (err) {
      registerForm.setError('root', { message: translateApiError(err) });
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const url = await getGoogleAuthorizeUrl();
      globalThis.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err));
      setGoogleLoading(false);
    }
  };

  // The forms use key="login"/"register" so they remount on mode switch,
  // resetting all state automatically — no explicit clearErrors() needed.
  const switchToRegister = () => setMode('register');
  const switchToLogin = () => setMode('login');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={t('app.header.toggleTheme')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{mode === 'login' ? t('auth.signIn.title') : t('auth.register.title')}</CardTitle>
          <CardDescription>
            {mode === 'login' ? t('auth.signIn.description') : t('auth.register.description')}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Button
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full"
          >
            {googleLoading ? t('auth.google.redirecting') : t('auth.google.continue')}
          </Button>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">{t('auth.separator')}</span>
            <Separator className="flex-1" />
          </div>

          {mode === 'login' ? (
            <form key="login" noValidate onSubmit={loginForm.handleSubmit(handleLogin)} className="flex flex-col gap-3">
              <FieldGroup>
                <Controller
                  name="email"
                  control={loginForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="login-email">{t('auth.fields.email')}</FieldLabel>
                      <Input
                        {...field}
                        id="login-email"
                        type="email"
                        placeholder={t('auth.fields.emailPlaceholder')}
                        autoComplete="email"
                        autoFocus
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="password"
                  control={loginForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="login-password">{t('auth.fields.password')}</FieldLabel>
                      <Input
                        {...field}
                        id="login-password"
                        type="password"
                        placeholder={t('auth.fields.passwordPlaceholder')}
                        autoComplete="current-password"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                {loginForm.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertDescription>{loginForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>

              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending && <Spinner />}
                {t('auth.signIn.submit')}
              </Button>
            </form>
          ) : (
            <form key="register" noValidate onSubmit={registerForm.handleSubmit(handleRegister)} className="flex flex-col gap-3">
              <FieldGroup>
                <Controller
                  name="name"
                  control={registerForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="register-name">{t('auth.fields.name')}</FieldLabel>
                      <Input
                        {...field}
                        id="register-name"
                        type="text"
                        placeholder={t('auth.fields.namePlaceholder')}
                        autoComplete="name"
                        autoFocus
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="email"
                  control={registerForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="register-email">{t('auth.fields.email')}</FieldLabel>
                      <Input
                        {...field}
                        id="register-email"
                        type="email"
                        placeholder={t('auth.fields.emailPlaceholder')}
                        autoComplete="email"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="password"
                  control={registerForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="register-password">{t('auth.fields.password')}</FieldLabel>
                      <Input
                        {...field}
                        id="register-password"
                        type="password"
                        placeholder={t('auth.fields.passwordPlaceholder')}
                        autoComplete="new-password"
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                {registerForm.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertDescription>{registerForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending && <Spinner />}
                {t('auth.register.submit')}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                {t('auth.signIn.switchPrompt')}{' '}
                <Button
                  type="button"
                  variant="link"
                  onClick={switchToRegister}
                  className="h-auto p-0 underline underline-offset-4"
                >
                  {t('auth.signIn.switchLink')}
                </Button>
              </>
            ) : (
              <>
                {t('auth.register.switchPrompt')}{' '}
                <Button
                  type="button"
                  variant="link"
                  onClick={switchToLogin}
                  className="h-auto p-0 underline underline-offset-4"
                >
                  {t('auth.register.switchLink')}
                </Button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

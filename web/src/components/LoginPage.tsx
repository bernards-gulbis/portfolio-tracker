import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'sonner';
import { Moon, Sun } from 'lucide-react';
import { getGoogleAuthorizeUrl, getErrorMessage } from '../api';
import { useLogin, useRegister } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [googleLoading, setGoogleLoading] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleLogin = async (values: LoginValues) => {
    try {
      await loginMutation.mutateAsync({ username: values.email, password: values.password });
    } catch (err) {
      loginForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleRegister = async (values: RegisterValues) => {
    try {
      await registerMutation.mutateAsync({ email: values.email, password: values.password });
      toast.success('Account created! Please log in.');
      loginForm.reset({ email: values.email, password: '' });
      setMode('login');
    } catch (err) {
      registerForm.setError('root', { message: getErrorMessage(err) });
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const url = await getGoogleAuthorizeUrl();
      window.location.href = url;
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
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="absolute top-4 right-4"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{mode === 'login' ? 'Sign In' : 'Create Account'}</CardTitle>
          <CardDescription>
            {mode === 'login'
              ? 'Sign in to access your portfolio'
              : 'Create an account to get started'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Button
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full"
          >
            {googleLoading ? 'Redirecting...' : 'Continue with Google'}
          </Button>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
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
                      <FieldLabel htmlFor="login-email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
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
                      <FieldLabel htmlFor="login-password">Password</FieldLabel>
                      <Input
                        {...field}
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
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
                {loginMutation.isPending ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form key="register" noValidate onSubmit={registerForm.handleSubmit(handleRegister)} className="flex flex-col gap-3">
              <FieldGroup>
                <Controller
                  name="email"
                  control={registerForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid || undefined}>
                      <FieldLabel htmlFor="register-email">Email</FieldLabel>
                      <Input
                        {...field}
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        autoFocus
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
                      <FieldLabel htmlFor="register-password">Password</FieldLabel>
                      <Input
                        {...field}
                        id="register-password"
                        type="password"
                        placeholder="••••••••"
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
                {registerMutation.isPending ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={switchToRegister}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

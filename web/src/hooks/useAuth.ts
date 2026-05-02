import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { login, register, getCurrentUser, updateUser, closeAccount, LoginCredentials, RegisterCredentials, CloseAccountRequest } from '../api';
import { useAuth } from '../context/AuthContext';

export const useLogin = () => {
  const { setUser } = useAuth();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (creds: LoginCredentials) => {
      await login(creds);
      return getCurrentUser();
    },
    onSuccess: (user) => {
      setUser(user);
      toast.success(t('auth.toasts.welcomeBack'));
    },
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: (creds: RegisterCredentials) => register(creds),
  });
};

export const useLogout = () => {
  const { logout } = useAuth();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      toast.success(t('auth.toasts.loggedOut'));
    },
  });
};

export const useUpdateProfile = () => {
  const { setUser } = useAuth();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      await updateUser({ name: data.name });
      // FastAPI Users PATCH response skips our custom handler, so re-fetch
      // via GET /users/me to keep oauth_providers populated.
      return getCurrentUser();
    },
    onSuccess: (user) => {
      setUser(user);
      toast.success(t('settings.toasts.profileUpdated'));
    },
  });
};

export const useChangePassword = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: { password: string }) => updateUser({ password: data.password }),
    onSuccess: () => {
      toast.success(t('settings.toasts.passwordChanged'));
    },
  });
};

export const useUpdateTaxRate = () => {
  const { setUser } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { tax_rate: number }) => {
      await updateUser({ tax_rate: data.tax_rate });
      return getCurrentUser();
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: ['portfolioStatus'] });
      toast.success(t('settings.toasts.taxRateUpdated'));
    },
  });
};

export const useCloseAccount = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: CloseAccountRequest) => closeAccount(data),
    onSuccess: () => {
      toast.success(t('settings.toasts.accountClosed'));
      globalThis.dispatchEvent(new CustomEvent('auth:logout'));
    },
  });
};

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { login, register, getCurrentUser, LoginCredentials, RegisterCredentials } from '../api';
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

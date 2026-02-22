import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { login, register, getCurrentUser, LoginCredentials, RegisterCredentials } from '../api';
import { useAuth } from '../context/AuthContext';

export const useLogin = () => {
  const { setUser } = useAuth();
  return useMutation({
    mutationFn: async (creds: LoginCredentials) => {
      await login(creds);
      return getCurrentUser();
    },
    onSuccess: (user) => {
      setUser(user);
      toast.success('Welcome back!');
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
  return useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      toast.success('Logged out');
    },
  });
};

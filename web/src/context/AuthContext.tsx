import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getCurrentUser, logoutApi, UserRead } from '../api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: UserRead | null;
  status: AuthStatus;
  setUser: (user: UserRead | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [user, setUserState] = useState<UserRead | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const setUser = useCallback((u: UserRead | null) => {
    setUserState(u);
    setStatus(u ? 'authenticated' : 'unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore logout errors — clear state regardless
    }
    setUserState(null);
    setStatus('unauthenticated');
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    // Show error toast if backend redirected back with ?oauth_error=
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      toast.error(t('auth.toasts.googleLoginFailed', { error: oauthError }));
      // Remove the query param without reloading the page
      window.history.replaceState({}, '', window.location.pathname);
    }

    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setStatus('unauthenticated');
      }
    };

    init();
  }, [setUser, t]);

  useEffect(() => {
    const handleAuthLogout = () => {
      setUserState(null);
      setStatus('unauthenticated');
      queryClient.clear();
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, status, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

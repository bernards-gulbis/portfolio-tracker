import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [user, setUser] = useState<UserRead | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const updateUser = useCallback((u: UserRead | null) => {
    setUser(u);
    setStatus(u ? 'authenticated' : 'unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore logout errors — clear state regardless
    }
    globalThis.dispatchEvent(new CustomEvent('auth:logout'));
  }, []);

  useEffect(() => {
    // Show error toast if backend redirected back with ?oauth_error=
    const params = new URLSearchParams(globalThis.location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) {
      toast.error(t('auth.toasts.googleLoginFailed', { error: oauthError }));
      // Remove the query param without reloading the page
      globalThis.history.replaceState({}, '', globalThis.location.pathname);
    }

    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        updateUser(currentUser);
      } catch {
        setStatus('unauthenticated');
      }
    };

    init();
  }, [updateUser, t]);

  useEffect(() => {
    const handleAuthLogout = () => {
      updateUser(null);
      queryClient.clear();
      navigate('/', { replace: true });
    };

    globalThis.addEventListener('auth:logout', handleAuthLogout);
    return () => globalThis.removeEventListener('auth:logout', handleAuthLogout);
  }, [queryClient, navigate, updateUser]);

  const value = useMemo(() => ({ user, status, setUser: updateUser, logout }), [user, status, updateUser, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

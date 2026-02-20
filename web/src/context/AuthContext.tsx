import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { getCurrentUser, logoutApi, UserRead } from '../api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: UserRead | null;
  status: AuthStatus;
  setUser: (user: UserRead | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, queryClient }: { children: ReactNode; queryClient: { clear: () => void } }) {
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
    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        setStatus('unauthenticated');
      }
    };

    init();
  }, [setUser]);

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

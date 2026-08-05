'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi, type AuthUser } from '@/lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/legal/')) {
      setLoading(false);
      return;
    }
    authApi.refresh()
      .then(({ user: current }) => setUser(current))
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`))
      .finally(() => setLoading(false));
  }, [pathname, router]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await authApi.login(email, password);
      setUser(result.user);
    },
    async logout() {
      await authApi.logout();
      setUser(null);
      router.replace('/login');
    },
  }), [user, loading, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}

'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi, api, type AuthUser } from '@/lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isPublicPath(pathname: string): boolean {
  return pathname === '/login'
    || pathname === '/setup'
    || pathname.startsWith('/legal/')
    || pathname.startsWith('/assinar/')
    || pathname.startsWith('/validar/');
}

function isSetupExemptPath(pathname: string): boolean {
  return pathname === '/setup'
    || pathname.startsWith('/legal/')
    || pathname.startsWith('/assinar/')
    || pathname.startsWith('/validar/');
}

function wait(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const publicPath = isPublicPath(pathname);
    let cancelled = false;
    setLoading(true);
    setStarting(false);

    async function resolveAuth() {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          const status = await api.get<{ required: boolean }>('/setup/status');
          if (cancelled) return;
          setStarting(false);
          if (status.required && !isSetupExemptPath(pathname)) {
            router.replace('/setup');
            return;
          }
          if (!status.required && pathname === '/setup') {
            router.replace('/login');
            return;
          }
          if (publicPath) {
            setLoading(false);
            return;
          }
          try {
            const { user: current } = await authApi.me();
            if (!cancelled) setUser(current);
          } catch {
            if (!cancelled) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          }
          if (!cancelled) setLoading(false);
          return;
        } catch {
          if (cancelled) return;
          if (publicPath) {
            setLoading(false);
            return;
          }
          setStarting(true);
          await wait(2000);
        }
      }
      if (!cancelled) {
        setStarting(false);
        setLoading(false);
        if (!publicPath) router.replace('/login');
      }
    }

    void resolveAuth();
    return () => { cancelled = true; };
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

  if ((loading || starting) && !isPublicPath(pathname)) {
    return (
      <AuthContext.Provider value={value}>
        <main className="login-page">
          <div className="login-card">
            <p>{starting ? 'Preparando a instalação…' : 'Carregando…'}</p>
          </div>
        </main>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}

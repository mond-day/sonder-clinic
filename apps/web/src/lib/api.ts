'use client';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  permissions: string[];
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function csrfHeaders(): HeadersInit {
  const token = readCookie('csrf_token');
  return token ? { 'X-CSRF-Token': token } : {};
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(mutating ? csrfHeaders() : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401 && retry && path !== '/auth/refresh') {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
    });
    if (refreshed.ok) return request<T>(path, init, false);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const detail = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
    throw new ApiError(detail ?? 'Não foi possível concluir a solicitação.', response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
};

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),
  refresh: () => request<{ user: AuthUser }>('/auth/refresh', { method: 'POST' }, false),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }, false),
};

/** Path relativo seguro para redirect pós-login (bloqueia //evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}

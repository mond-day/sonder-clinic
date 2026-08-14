import { API_URL } from './api';

export type ClinicBranding = {
  name?: string;
  subtitle?: string;
  logoUrl?: string;
  primaryColor?: string;
  source?: string;
};

export const DEFAULT_BRAND_NAME = 'Sonder Clinic';
export const DEFAULT_BRAND_MARK = 'S';

export function apiOrigin(): string {
  return API_URL.replace(/\/api\/v1\/?$/, '');
}

export function publicApiDocsUrl(): string {
  return `${API_URL.replace(/\/$/, '')}/public/docs`;
}

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = apiOrigin();
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export function brandDisplayName(branding?: ClinicBranding | null, fallback = DEFAULT_BRAND_NAME): string {
  const name = branding?.name?.trim();
  if (!name) return fallback;
  const subtitle = branding?.subtitle?.trim();
  if (/^sonder$/i.test(name) && /^clinic$/i.test(subtitle ?? '')) return fallback;
  return name;
}

export function brandInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_BRAND_MARK;
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
  return (letters[0] ?? DEFAULT_BRAND_MARK).toUpperCase();
}

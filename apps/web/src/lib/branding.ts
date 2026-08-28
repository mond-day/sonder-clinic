import { getApiUrl } from './api';

export type ClinicBranding = {
  name?: string;
  subtitle?: string;
  logoUrl?: string;
  primaryColor?: string;
  source?: string;
};

export const DEFAULT_BRAND_NAME = 'Sonder Clinic';
export const DEFAULT_BRAND_MARK = 'S';
export const BRANDING_UPDATED_EVENT = 'sonder:branding-updated';

export function notifyBrandingUpdated(clinicId?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT, { detail: { clinicId } }));
}

export function apiOrigin(): string {
  return getApiUrl().replace(/\/api\/v1\/?$/, '');
}

export function publicApiDocsUrl(): string {
  return `${getApiUrl().replace(/\/$/, '')}/public/docs`;
}

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = apiOrigin();
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`;
}

export function brandDisplayName(branding?: ClinicBranding | null, fallback = DEFAULT_BRAND_NAME): string {
  return branding?.name?.trim() || fallback;
}

export function brandSubtitle(
  branding?: ClinicBranding | null,
  fallback = 'Gestão odontológica',
): string {
  const subtitle = branding?.subtitle?.trim();
  if (subtitle) return subtitle;
  return fallback;
}

export function brandInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_BRAND_MARK;
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
  return (letters[0] ?? DEFAULT_BRAND_MARK).toUpperCase();
}

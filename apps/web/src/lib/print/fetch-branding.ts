import { api } from '../api';
import type { PrintBranding } from './print-layout';

type BrandingResponse = {
  name?: string;
  subtitle?: string;
  primaryColor?: string;
  logoUrl?: string;
  source?: string;
};

/** Carrega identidade visual da clínica; não inventa marca se a API falhar. */
export async function fetchPrintBranding(clinicId?: string, fallbackName?: string): Promise<PrintBranding> {
  const fallback: PrintBranding = fallbackName?.trim() ? { clinicName: fallbackName.trim() } : {};
  if (!clinicId) return fallback;
  try {
    const branding = await api.get<BrandingResponse>(`/settings/branding?clinicId=${encodeURIComponent(clinicId)}`);
    const subtitle = branding.subtitle?.trim();
    const isEnvPlaceholder = branding.source !== 'tenant' && /^clinic$/i.test(subtitle ?? '');
    return {
      clinicName: branding.name?.trim() || fallback.clinicName,
      subtitle: subtitle && !isEnvPlaceholder ? subtitle : undefined,
      primaryColor: branding.primaryColor,
      logoUrl: branding.logoUrl?.trim() || undefined,
    };
  } catch {
    return fallback;
  }
}

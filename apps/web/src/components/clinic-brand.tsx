'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  brandDisplayName,
  brandInitial,
  DEFAULT_BRAND_NAME,
  resolveMediaUrl,
  type ClinicBranding,
} from '@/lib/branding';

export function useClinicBranding(clinicId?: string, authenticated = true) {
  const [branding, setBranding] = useState<ClinicBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = authenticated && clinicId
      ? `/settings/branding?clinicId=${encodeURIComponent(clinicId)}`
      : '/auth/branding';
    api.get<ClinicBranding>(path)
      .then((next) => {
        if (!cancelled) setBranding(next);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, clinicId]);

  return branding;
}

export function ClinicBrandMark({
  branding,
  fallbackName = DEFAULT_BRAND_NAME,
  className = 'brand-mark',
}: {
  branding?: ClinicBranding | null;
  fallbackName?: string;
  className?: string;
}) {
  const name = brandDisplayName(branding, fallbackName);
  const logoUrl = resolveMediaUrl(branding?.logoUrl);
  if (logoUrl) {
    return (
      <span className={`${className} has-logo`}>
        <img src={logoUrl} alt="" />
      </span>
    );
  }
  return <span className={className}>{brandInitial(name)}</span>;
}

export function ClinicBrandText({
  branding,
  fallbackName = DEFAULT_BRAND_NAME,
  fallbackSubtitle = 'Gestão odontológica',
}: {
  branding?: ClinicBranding | null;
  fallbackName?: string;
  fallbackSubtitle?: string;
}) {
  const name = brandDisplayName(branding, fallbackName);
  const subtitle = branding?.subtitle?.trim() && branding.source === 'tenant'
    ? branding.subtitle.trim()
    : fallbackSubtitle;
  return (
    <div className="brand-text">
      <strong>{name}</strong>
      <small>{subtitle}</small>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  apiOrigin,
  brandDisplayName,
  brandInitial,
  brandSubtitle,
  BRANDING_UPDATED_EVENT,
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

    function load() {
      api.get<ClinicBranding>(path)
        .then((next) => {
          if (!cancelled) setBranding(next);
        })
        .catch(() => {
          if (!cancelled) setBranding(null);
        });
    }

    load();

    function onUpdated(event: Event) {
      const detail = (event as CustomEvent<{ clinicId?: string }>).detail;
      if (detail?.clinicId && clinicId && detail.clinicId !== clinicId) return;
      load();
    }

    window.addEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    };
  }, [authenticated, clinicId]);

  return branding;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function setDocumentFavicon(href: string, type?: string) {
  let link = document.querySelector<HTMLLinkElement>('link[data-clinic-favicon]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.dataset.clinicFavicon = 'true';
    document.head.appendChild(link);
  }
  if (type) link.type = type;
  else link.removeAttribute('type');
  link.href = href;
}

/**
 * Ícone da aba a partir do favicon da identidade visual.
 * Os arquivos da API exigem cookie de sessão, então o ícone é baixado com credenciais e aplicado como data URL
 * (também evita o cache agressivo de favicon do navegador).
 */
export function useDocumentFavicon(faviconUrl?: string) {
  useEffect(() => {
    const url = resolveMediaUrl(faviconUrl);
    if (!url) {
      document.querySelector('link[data-clinic-favicon]')?.remove();
      return;
    }
    if (url.startsWith('data:')) {
      setDocumentFavicon(url);
      return;
    }
    let cancelled = false;
    fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (!cancelled) setDocumentFavicon(dataUrl, blob.type || undefined);
      })
      .catch(() => {
        if (cancelled || url.startsWith(apiOrigin())) return;
        setDocumentFavicon(`${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(faviconUrl ?? '')}`);
      });
    return () => {
      cancelled = true;
    };
  }, [faviconUrl]);
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
  const subtitle = brandSubtitle(branding, fallbackSubtitle);
  return (
    <div className="brand-text">
      <strong>{name}</strong>
      <small>{subtitle}</small>
    </div>
  );
}

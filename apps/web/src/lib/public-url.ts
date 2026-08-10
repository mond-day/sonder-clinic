/** Monta URL absoluta canônica para links públicos (assinatura remota, etc.). */
export function publicAppUrl(path: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configured && configured.length > 0
    ? configured
    : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

export function isLocalhostAppUrl(url?: string) {
  try {
    const target = url ?? (typeof window !== 'undefined' ? window.location.href : '');
    const host = new URL(target).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

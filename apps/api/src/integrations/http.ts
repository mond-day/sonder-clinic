export type AdapterResult = {
  success: boolean;
  provider: string;
  enabled: boolean;
  message: string;
  detail?: unknown;
};

export function envFlag(name: string, fallback = 'true') {
  return (process.env[name] ?? fallback).toLowerCase() === 'true';
}

export function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: response.ok, status: response.status, body };
}

export function httpErrorDetail(body: unknown, fallback: string) {
  if (typeof body === 'string' && body.trim()) {
    return body.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  const row = asRecord(body);
  if (!row) return fallback;
  const message = pickString(row.error, row.message, asRecord(row.error)?.message);
  return message || fallback;
}

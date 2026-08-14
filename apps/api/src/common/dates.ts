const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

function parseIsoDay(value: unknown): { year: string; month: string; day: string } | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = String(value.getUTCFullYear());
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) || (typeof value === 'object' && !raw.includes('T'))) {
      return { year, month, day };
    }
  }
  const raw = String(value).trim();
  const match = ISO_DAY.exec(raw);
  if (!match) return null;
  return { year: match[1]!, month: match[2]!, day: match[3]! };
}

/** Data civil `YYYY-MM-DD` (ou prefixo ISO) → `DD/MM/AAAA`, sem deslocar fuso. */
export function formatBrazilianDate(value: unknown, fallback = ''): string {
  if (value == null || value === '') return fallback;
  const raw = String(value).trim();
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = parseIsoDay(raw);
  if (parsed && (dayOnly || !raw.includes('T'))) {
    return `${parsed.day}/${parsed.month}/${parsed.year}`;
  }
  if (raw.includes('T') || value instanceof Date) {
    const date = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(date.getTime())) return fallback || raw;
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
  }
  if (parsed) return `${parsed.day}/${parsed.month}/${parsed.year}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback || raw;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
}

/** `14 de agosto de 2026` a partir de `YYYY-MM-DD` ou Date. */
export function formatBrazilianDateLong(value: unknown, fallback = ''): string {
  const parsed = parseIsoDay(value);
  if (!parsed) return formatBrazilianDate(value, fallback);
  const month = MONTHS_PT[Number(parsed.month) - 1];
  if (!month) return formatBrazilianDate(value, fallback);
  return `${Number(parsed.day)} de ${month} de ${parsed.year}`;
}

export function formatBrazilianDateTime(value: unknown, fallback = ''): string {
  if (value == null || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

/** Normaliza CRO para `CRO-UF número`. Não inventa UF. */
export function formatCro(input: {
  number?: string | null;
  state?: string | null;
} | string | null | undefined): string {
  if (input == null || input === '') return '';
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const parsed = /(?:CRO[\s\-\/]*)?([A-Za-z]{2})[\s\-\/]+(\d+)/.exec(trimmed)
      ?? /CRO[\s\-\/]*([A-Za-z]{2})(\d+)/i.exec(trimmed);
    if (parsed) return `CRO-${parsed[1]!.toUpperCase()} ${parsed[2]}`;
    return trimmed;
  }
  const digits = (input.number ?? '').replace(/\D/g, '');
  const state = (input.state ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!digits) return '';
  if (!state) return `CRO ${digits}`;
  return `CRO-${state} ${digits}`;
}

export function formatCpfFull(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return (value ?? '').trim();
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

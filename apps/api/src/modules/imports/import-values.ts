import { createHash } from 'node:crypto';
import type { CellValue } from './import-types';

const NAME_STOPWORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Texto opcional: vazio e "-" viram undefined. */
export function optionalText(value: CellValue | undefined): string | undefined {
  const text = cellText(value);
  return text && text !== '-' ? text : undefined;
}

export function onlyDigits(value: CellValue | undefined): string {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value).toString() : '';
  return cellText(value).replace(/\D/g, '');
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(value: string): string[] {
  return normalizeName(value).split(' ').filter((token) => token && !NAME_STOPWORDS.has(token));
}

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/** Telefone BR em dígitos (DDD + número). Remove DDI 55. Sem DDD retorna null. */
export function normalizePhone(value: CellValue | undefined): string | null {
  let digits = onlyDigits(value);
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11 ? digits : null;
}

export function phoneMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(-8) === b.slice(-8);
}

export type DateParts = { year: number; month: number; day: number };
export type DateTimeParts = DateParts & { hour: number; minute: number };

function validParts(year: number, month: number, day: number): DateParts | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || year > 2100) return null;
  return { year, month, day };
}

/**
 * Datas de célula do Excel chegam como Date em UTC meia-noite (data civil).
 * Texto aceito: dd/mm/aaaa [hh:mm] ou aaaa-mm-dd.
 */
export function parseDateTime(value: CellValue | undefined): DateTimeParts | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = validParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return parts ? { ...parts, hour: value.getUTCHours(), minute: value.getUTCMinutes() } : null;
  }
  const text = cellText(value);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(text);
  const match = br
    ? { day: br[1], month: br[2], year: br[3], hour: br[4], minute: br[5] }
    : iso
      ? { year: iso[1], month: iso[2], day: iso[3], hour: iso[4], minute: iso[5] }
      : null;
  if (!match) return null;
  const parts = validParts(Number(match.year), Number(match.month), Number(match.day));
  if (!parts) return null;
  const hour = match.hour ? Number(match.hour) : 0;
  const minute = match.minute ? Number(match.minute) : 0;
  if (hour > 23 || minute > 59) return null;
  return { ...parts, hour, minute };
}

export function parseDate(value: CellValue | undefined): DateParts | null {
  const parsed = parseDateTime(value);
  return parsed ? { year: parsed.year, month: parsed.month, day: parsed.day } : null;
}

export function parseTime(value: CellValue | undefined): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(cellText(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function dateOnlyUtc(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function isoDay(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** Converte data/hora de parede no fuso da clínica para o instante UTC. */
export function zonedToUtc(parts: DateTimeParts, timeZone: string): Date {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let instant = wall - timeZoneOffsetMs(new Date(wall), timeZone);
  instant = wall - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Data sem hora (00:00) vira meio-dia no fuso da clínica, para não mudar de dia em nenhum fuso do Brasil. */
export function civilToUtc(parts: DateTimeParts, timeZone: string): Date {
  const hasTime = parts.hour !== 0 || parts.minute !== 0;
  return zonedToUtc(hasTime ? parts : { ...parts, hour: 12, minute: 0 }, timeZone);
}

export function sumMoney(values: string[]): string {
  const cents = values.reduce((total, value) => total + Math.round(Number(value) * 100), 0);
  return (cents / 100).toFixed(2);
}

/** "R$ 1.234,56", "1234,56" ou número → string decimal com 2 casas. */
export function parseMoney(value: CellValue | undefined): string | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : null;
  const text = cellText(value).replace(/R\$/i, '').replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized).toFixed(2);
}

export function ageOn(birth: DateParts, today: Date): number {
  let age = today.getUTCFullYear() - birth.year;
  const beforeBirthday = today.getUTCMonth() + 1 < birth.month
    || (today.getUTCMonth() + 1 === birth.month && today.getUTCDate() < birth.day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function splitList(value: CellValue | undefined): string[] {
  return [...new Set(cellText(value).split(',').map((item) => item.trim()).filter((item) => item && item !== '-'))];
}

export function hashKey(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex').slice(0, 32);
}

/**
 * Chaves naturais de linhas sem ID na planilha: linhas idênticas ganham sufixo de ocorrência
 * para que duas consultas iguais no mesmo arquivo não colapsem numa só.
 */
export function withOccurrence(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return `${key}#${count}`;
  });
}

const BRAZIL_STATES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const STATE_CODES = new Set(Object.values(BRAZIL_STATES));

export function normalizeState(value: CellValue | undefined): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (STATE_CODES.has(upper)) return upper;
  return BRAZIL_STATES[normalizeName(text)] ?? null;
}

export function maskCpf(cpf: string | null | undefined): string {
  return cpf ? `***.***.*${cpf.slice(8, 9)}-${cpf.slice(9)}` : '—';
}

export function formatDay(parts: DateParts | null | undefined): string {
  if (!parts) return '—';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

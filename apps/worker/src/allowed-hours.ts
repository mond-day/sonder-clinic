/**
 * allowedHours — formato mínimo suportado pelo worker:
 * {
 *   "start": "08:00",
 *   "end": "20:00",
 *   "weekdays": [1, 2, 3, 4, 5],  // 0=dom … 6=sáb (local America/Cuiaba)
 *   "timezone": "America/Cuiaba"  // opcional; default America/Cuiaba
 * }
 * Objeto vazio `{}` ou ausente → sempre permitido.
 */

export type AllowedHours = {
  start?: string;
  end?: string;
  weekdays?: number[];
  timezone?: string;
};

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function partsInTz(date: Date, timeZone: string): { weekday: number; minutes: number } {
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = map[weekdayName] ?? date.getUTCDay();
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const minutes = parseHm(time) ?? 0;
  return { weekday, minutes };
}

export function normalizeAllowedHours(raw: unknown): AllowedHours | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length === 0) return null;
  return {
    start: typeof value.start === 'string' ? value.start : undefined,
    end: typeof value.end === 'string' ? value.end : undefined,
    weekdays: Array.isArray(value.weekdays)
      ? value.weekdays.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 6)
      : undefined,
    timezone: typeof value.timezone === 'string' ? value.timezone : undefined,
  };
}

export function isWithinAllowedHours(raw: unknown, now = new Date()): boolean {
  const config = normalizeAllowedHours(raw);
  if (!config) return true;
  const timeZone = config.timezone?.trim() || 'America/Cuiaba';
  const { weekday, minutes } = partsInTz(now, timeZone);
  if (config.weekdays?.length && !config.weekdays.includes(weekday)) return false;
  const start = config.start ? parseHm(config.start) : 0;
  const end = config.end ? parseHm(config.end) : 24 * 60 - 1;
  if (start === null || end === null) return true;
  if (start <= end) return minutes >= start && minutes <= end;
  // janela que atravessa meia-noite
  return minutes >= start || minutes <= end;
}

/** Próximo instante (aprox. +15 min steps no dia, ou próximo weekday) para leaseUntil. */
export function nextAllowedWindowStart(raw: unknown, now = new Date()): Date {
  const config = normalizeAllowedHours(raw);
  if (!config) return now;
  const timeZone = config.timezone?.trim() || 'America/Cuiaba';
  // Aproxima: avança 30 minutos até 7 dias ou encontra janela.
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 7 * 48; i += 1) {
    cursor.setTime(cursor.getTime() + 30 * 60_000);
    if (isWithinAllowedHours(config, cursor)) return cursor;
  }
  // fallback 1h
  return new Date(now.getTime() + 60 * 60_000);
}

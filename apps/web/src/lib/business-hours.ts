/** Horário comercial da clínica (agenda / orientação visual — não bloqueia agendamentos). */

export type BusinessHoursRule = {
  start: string;
  end: string;
  weekdays: number[];
};

export type BusinessHours = {
  rules: BusinessHoursRule[];
  timezone?: string;
  source?: 'tenant' | 'default';
};

/** Formato legado (uma faixa para todos os dias). */
type LegacyBusinessHours = {
  start?: string;
  end?: string;
  weekdays?: number[];
  timezone?: string;
  source?: 'tenant' | 'default';
  rules?: BusinessHoursRule[];
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  rules: [{ start: '08:00', end: '18:00', weekdays: [1, 2, 3, 4, 5] }],
  timezone: 'America/Cuiaba',
  source: 'default',
};

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
] as const;

/** Extrai a hora inteira (0–23) de "HH:mm"; fallback se inválido. */
export function hourFromHm(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

function minutesFromHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function sanitizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 6))].sort((a, b) => a - b);
}

function sanitizeRule(raw: Partial<BusinessHoursRule> | null | undefined): BusinessHoursRule | null {
  const start = typeof raw?.start === 'string' && raw.start.trim() ? raw.start.trim() : '';
  const end = typeof raw?.end === 'string' && raw.end.trim() ? raw.end.trim() : '';
  const weekdays = sanitizeWeekdays(raw?.weekdays);
  if (!start || !end || !weekdays.length) return null;
  return { start, end, weekdays };
}

/** Converte payload antigo `{ start, end, weekdays }` em uma regra. */
export function normalizeBusinessHours(raw: LegacyBusinessHours | null | undefined): BusinessHours {
  const timezone = typeof raw?.timezone === 'string' && raw.timezone.trim()
    ? raw.timezone.trim()
    : DEFAULT_BUSINESS_HOURS.timezone;
  const source: 'tenant' | 'default' = raw?.source === 'tenant' ? 'tenant' : 'default';

  if (Array.isArray(raw?.rules) && raw.rules.length) {
    const rules = raw.rules
      .map((rule) => sanitizeRule(rule))
      .filter((rule): rule is BusinessHoursRule => Boolean(rule));
    if (rules.length) {
      return { rules, timezone, source };
    }
  }

  const legacy = sanitizeRule({
    start: raw?.start,
    end: raw?.end,
    weekdays: raw?.weekdays,
  });
  if (legacy) {
    return {
      rules: [legacy],
      timezone,
      // Payload legado sem `source` veio do tenant (settingsJson).
      source: raw?.source === 'default' ? 'default' : 'tenant',
    };
  }

  return {
    ...DEFAULT_BUSINESS_HOURS,
    rules: DEFAULT_BUSINESS_HOURS.rules.map((rule) => ({ ...rule, weekdays: [...rule.weekdays] })),
    source: 'default',
  };
}

export function createEmptyBusinessHoursRule(): BusinessHoursRule {
  return { start: '08:00', end: '18:00', weekdays: [] };
}

export function formatWeekdaysLabel(weekdays: number[]): string {
  return WEEKDAY_OPTIONS
    .filter((day) => weekdays.includes(day.value))
    .map((day) => day.label)
    .join(', ') || '—';
}

export function ruleForWeekday(hours: BusinessHours, weekday: number): BusinessHoursRule | undefined {
  return hours.rules.find((rule) => rule.weekdays.includes(weekday));
}

export function isBusinessWeekday(hours: BusinessHours, date: Date): boolean {
  return hours.rules.some((rule) => rule.weekdays.includes(date.getDay()));
}

export function isWithinBusinessHourRange(hour: number, startHour: number, endHour: number): boolean {
  if (startHour <= endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/** Limites da grade: menor início e maior fim entre todas as regras. */
export function getBusinessHoursGridBounds(hours: BusinessHours): { startHour: number; endHour: number } {
  if (!hours.rules.length) {
    return { startHour: 8, endHour: 18 };
  }
  let startHour = 23;
  let endHour = 0;
  for (const rule of hours.rules) {
    startHour = Math.min(startHour, hourFromHm(rule.start, 8));
    endHour = Math.max(endHour, hourFromHm(rule.end, 18));
  }
  return { startHour, endHour };
}

/** Validação de rascunho no cliente (mesmas regras da API). */
export function validateBusinessHoursDraft(hours: BusinessHours): string | null {
  if (!hours.rules.length) return 'Adicione pelo menos uma regra de horário.';
  const seenDays = new Map<number, number>();
  for (let index = 0; index < hours.rules.length; index += 1) {
    const rule = hours.rules[index]!;
    if (!rule.weekdays.length) {
      return `Regra ${index + 1}: selecione pelo menos um dia.`;
    }
    const startMin = minutesFromHm(rule.start);
    const endMin = minutesFromHm(rule.end);
    if (startMin === null || endMin === null) {
      return `Regra ${index + 1}: use o formato HH:mm.`;
    }
    if (endMin <= startMin) {
      return `Regra ${index + 1}: o fim deve ser depois do início.`;
    }
    for (const day of rule.weekdays) {
      const previous = seenDays.get(day);
      if (previous !== undefined) {
        const label = WEEKDAY_OPTIONS.find((item) => item.value === day)?.label ?? String(day);
        return `${label} aparece na regra ${previous + 1} e na regra ${index + 1}. Cada dia só pode estar em uma regra.`;
      }
      seenDays.set(day, index);
    }
  }
  return null;
}

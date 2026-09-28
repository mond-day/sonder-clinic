/**
 * Regras de mensagens automáticas compartilhadas por API e worker
 * (sem dependências: roda com o type stripping do Node).
 */

export const MESSAGE_TEMPLATE_VARIABLES = [
  'patientName',
  'date',
  'clinicName',
  'professionalName',
  'clinicAddress',
  'appointmentTime',
] as const;

export type MessageTemplateVariable = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];

const TEMPLATE_TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function isMessageTemplateVariable(key: string): key is MessageTemplateVariable {
  return (MESSAGE_TEMPLATE_VARIABLES as readonly string[]).includes(key);
}

export function extractMessageTemplateTokens(content: string): string[] {
  return [...new Set([...content.matchAll(TEMPLATE_TOKEN)].map((match) => match[1]!))];
}

/** Troca `{{variavel}}` conhecida pelo valor; tokens desconhecidos ficam como estão. */
export function renderMessageTemplateText(
  content: string,
  variables: Partial<Record<MessageTemplateVariable, string>>,
): string {
  return content.replace(TEMPLATE_TOKEN, (match, key: string) => {
    if (!isMessageTemplateVariable(key)) return match;
    return variables[key] ?? '';
  });
}

export type AppointmentMessageCategory = 'REMINDER' | 'CONFIRMATION';
export type MondaySendDay = 'FRIDAY' | 'SUNDAY';

export type MessageSchedule = {
  /** Antecedência em minutos antes da consulta (Lembrete / Confirmação). */
  leadMinutes?: number;
  /** Consulta na segunda: envio na sexta anterior ou no domingo (véspera). */
  mondaySendDay?: MondaySendDay;
};

export const DEFAULT_REMINDER_LEAD_MINUTES = 1440;
export const DEFAULT_MONDAY_SEND_DAY: MondaySendDay = 'FRIDAY';
export const MIN_LEAD_MINUTES = 15;
export const MAX_LEAD_MINUTES = 10080;

/** Canal do AppointmentReminder que carrega o pedido de confirmação. */
export const CONFIRMATION_REMINDER_CHANNEL = 'WHATSAPP:CONFIRMATION';

export function reminderCategoryFromChannel(channel: string): AppointmentMessageCategory {
  return channel === CONFIRMATION_REMINDER_CHANNEL ? 'CONFIRMATION' : 'REMINDER';
}

/** Leitura tolerante do JSON gravado em MessageTemplate.schedule. */
export function readMessageSchedule(value: unknown): MessageSchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const schedule: MessageSchedule = {};
  const lead = Number(raw.leadMinutes);
  if (Number.isInteger(lead) && lead >= MIN_LEAD_MINUTES && lead <= MAX_LEAD_MINUTES) {
    schedule.leadMinutes = lead;
  }
  if (raw.mondaySendDay === 'FRIDAY' || raw.mondaySendDay === 'SUNDAY') {
    schedule.mondaySendDay = raw.mondaySendDay;
  }
  return schedule;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function weekdayInTimeZone(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return WEEKDAY_INDEX[label] ?? date.getUTCDay();
}

/**
 * Consulta na segunda cujo envio cairia no fim de semana: com `FRIDAY`, adianta
 * para a sexta anterior no mesmo horário; com `SUNDAY`, mantém a véspera.
 * Se a sexta já passou (consulta marcada no fim de semana), mantém o horário original.
 */
export function applyMondaySendDay(input: {
  scheduledFor: Date;
  appointmentStart: Date;
  timeZone: string;
  mondaySendDay: MondaySendDay;
  now?: Date;
}): Date {
  if (input.mondaySendDay !== 'FRIDAY') return input.scheduledFor;
  if (weekdayInTimeZone(input.appointmentStart, input.timeZone) !== 1) return input.scheduledFor;
  const sendWeekday = weekdayInTimeZone(input.scheduledFor, input.timeZone);
  const daysBack = sendWeekday === 0 ? 2 : sendWeekday === 6 ? 1 : 0;
  if (!daysBack) return input.scheduledFor;
  const friday = new Date(input.scheduledFor.getTime() - daysBack * 86_400_000);
  return friday < (input.now ?? new Date()) ? input.scheduledFor : friday;
}

export type InboundReplyIntent = 'CONFIRM' | 'CANCEL';

export const CONFIRM_REPLY_KEYWORDS = ['sim', 's', 'confirmar', 'confirmo', 'confirmado', 'confirmada', '1'] as const;
export const CANCEL_REPLY_KEYWORDS = ['nao', 'n', 'cancelar', 'cancelo', 'cancela', 'desmarcar', '2'] as const;

function normalizeReply(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Resposta curta reconhecível ("Sim", "1", "Não, obrigado", "cancelar").
 * Mensagens longas ou ambíguas retornam null para a equipe tratar manualmente.
 */
export function parseInboundReply(text: string): InboundReplyIntent | null {
  const tokens = normalizeReply(text);
  if (!tokens.length || tokens.length > 3) return null;
  const confirm = tokens.some((token) => (CONFIRM_REPLY_KEYWORDS as readonly string[]).includes(token));
  const cancel = tokens.some((token) => (CANCEL_REPLY_KEYWORDS as readonly string[]).includes(token));
  const first = tokens[0]!;
  if (confirm && cancel) return null;
  if ((CONFIRM_REPLY_KEYWORDS as readonly string[]).includes(first)) return 'CONFIRM';
  if ((CANCEL_REPLY_KEYWORDS as readonly string[]).includes(first)) return 'CANCEL';
  return null;
}

function nationalDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
}

/**
 * Compara telefones BR tolerando DDI 55, máscara e o 9º dígito que o WhatsApp
 * às vezes omite: mesmo DDD e mesmos 8 dígitos finais.
 */
export function phonesMatch(left: string, right: string): boolean {
  const a = nationalDigits(left);
  const b = nationalDigits(right);
  if (a.length < 8 || b.length < 8) return false;
  if (a.slice(-8) !== b.slice(-8)) return false;
  if (a.length >= 10 && b.length >= 10) return a.slice(0, 2) === b.slice(0, 2);
  return true;
}

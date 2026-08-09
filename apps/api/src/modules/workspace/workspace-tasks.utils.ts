import { BadRequestException } from '@nestjs/common';

export type TaskRecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export function advanceTaskOccurrence(
  from: Date,
  frequency: string,
  interval = 1,
): Date {
  const next = new Date(from);
  const step = Math.max(1, interval);
  switch (frequency.toUpperCase()) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + step);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7 * step);
      break;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + step);
      break;
    default:
      throw new BadRequestException(`Frequência de recorrência inválida: ${frequency}`);
  }
  return next;
}

export function normalizeTaskFrequency(value: string): TaskRecurrenceFrequency {
  const upper = value.trim().toUpperCase();
  if (upper === 'DAILY' || upper === 'WEEKLY' || upper === 'MONTHLY') return upper;
  throw new BadRequestException('Frequência deve ser DAILY, WEEKLY ou MONTHLY.');
}

/** Chave idempotente por tarefa-origem + data da ocorrência (UTC YYYY-MM-DD). */
export function taskOccurrenceKey(sourceTaskId: string, occurrence: Date): string {
  return `${sourceTaskId}:${occurrence.toISOString().slice(0, 10)}`;
}

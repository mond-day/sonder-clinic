/**
 * Helpers puros para espelho Sonder → Nibo (schedules credit/debit).
 */

export type NiboPushEntityType = 'Receivable' | 'Payable';

export function firstConfiguredId(ids: string[]): string | null {
  const id = ids.find((item) => item.trim());
  return id?.trim() || null;
}

export function toNiboDate(value: Date | string): string {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function toNiboAmount(value: { toString(): string } | string | number): number {
  const raw = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw * 100) / 100;
}

export function niboReference(entityType: NiboPushEntityType, entityId: string): string {
  return `sonder:${entityType.toLowerCase()}:${entityId}`;
}

export function extractNiboScheduleId(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    const trimmed = body.trim().replace(/^"|"$/g, '');
    return trimmed || null;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const row = body as Record<string, unknown>;
    for (const key of ['scheduleId', 'id', 'value']) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

export function extractNiboStakeholderId(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    return body.trim().replace(/^"|"$/g, '') || null;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const row = body as Record<string, unknown>;
    for (const key of ['id', 'stakeholderId', 'value']) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

export function readNiboAccountId(config: Record<string, unknown> | undefined): string | null {
  if (!config) return null;
  for (const key of ['accountId', 'defaultAccountId', 'niboAccountId']) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // Compat: lista persistida (accountIds / niboAccountIds) — baixa Nibo usa só a primeira.
  for (const key of ['accountIds', 'niboAccountIds']) {
    const raw = config[key];
    if (!Array.isArray(raw)) continue;
    const first = raw.map((item) => String(item ?? '').trim()).find(Boolean);
    if (first) return first;
  }
  return null;
}

export function buildCreditSchedulePayload(input: {
  stakeholderId: string;
  description: string;
  dueDate: string;
  amount: number;
  categoryId: string;
  costCenterId: string | null;
  reference: string;
}) {
  const payload: Record<string, unknown> = {
    stakeholderId: input.stakeholderId,
    description: input.description.slice(0, 500),
    reference: input.reference,
    scheduleDate: input.dueDate,
    dueDate: input.dueDate,
    accrualDate: input.dueDate,
    categories: [{ categoryId: input.categoryId, value: input.amount }],
  };
  if (input.costCenterId) {
    payload.costCenterValueType = 0;
    payload.costCenters = [{ costCenterId: input.costCenterId, value: input.amount }];
  }
  return payload;
}

export function buildDebitSchedulePayload(input: {
  stakeholderId: string;
  description: string;
  dueDate: string;
  amount: number;
  categoryId: string;
  costCenterId: string | null;
  reference: string;
}) {
  const payload: Record<string, unknown> = {
    stakeholderId: input.stakeholderId,
    description: input.description.slice(0, 500),
    reference: input.reference,
    scheduleDate: input.dueDate,
    dueDate: input.dueDate,
    accrualDate: input.dueDate,
    categories: [{ categoryId: input.categoryId, value: input.amount }],
  };
  if (input.costCenterId) {
    payload.costCenterValueType = 0;
    payload.costCenters = [{ costCenterId: input.costCenterId, value: input.amount }];
  }
  return payload;
}

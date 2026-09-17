/**
 * Helpers puros para importação Nibo → Financeiro.
 */

import type { NiboScheduleItem } from '../../integrations/nibo-schedules';

export const NIBO_FALLBACK_PATIENT_NAME = 'Importação Nibo (sem paciente)';
export const NIBO_FALLBACK_PATIENT_PHONE = '00000000000';

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function dueDateOnly(isoOrDate: string): string {
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export function amountString(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  return value.toFixed(2);
}

export function niboScheduleStatus(item: NiboScheduleItem): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (item.isPaid || (item.value > 0 && item.paidValue >= item.value)) return 'PAID';
  if (item.paidValue > 0) return 'PARTIALLY_PAID';
  return 'OPEN';
}

export function readNiboIdList(
  config: Record<string, unknown> | undefined,
  arrayKey: string,
  singularKey?: string,
): string[] {
  if (!config) return [];
  const raw = config[arrayKey];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean))];
  }
  if (singularKey) {
    const single = String(config[singularKey] ?? '').trim();
    return single ? [single] : [];
  }
  return [];
}

export function matchesNiboFilters(
  item: NiboScheduleItem,
  filters: { categoryIds: string[]; costCenterIds: string[] },
): boolean {
  if (filters.categoryIds.length) {
    if (!item.categoryId || !filters.categoryIds.includes(item.categoryId)) return false;
  }
  if (filters.costCenterIds.length) {
    if (!item.costCenterId || !filters.costCenterIds.includes(item.costCenterId)) return false;
  }
  return true;
}

export function buildPayableNotes(item: NiboScheduleItem): string {
  const parts = [
    `Importado do Nibo (scheduleId=${item.scheduleId})`,
    item.categoryName ? `Categoria Nibo: ${item.categoryName}` : null,
    item.costCenterName ? `Centro de custo Nibo: ${item.costCenterName}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function buildReceivableDescription(item: NiboScheduleItem): string {
  const stakeholder = item.stakeholderName?.trim();
  if (stakeholder && !item.description.toLowerCase().includes(stakeholder.toLowerCase())) {
    return `${item.description} — ${stakeholder}`;
  }
  return item.description;
}

/** Campos de Receivable atualizáveis a partir de um schedule Nibo (sem patientId). */
export function receivableFieldsFromNibo(item: NiboScheduleItem) {
  const amount = amountString(item.value);
  return {
    description: buildReceivableDescription(item),
    originalAmount: amount,
    discount: '0',
    surcharge: '0',
    netAmount: amount,
    dueDate: new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`),
    status: niboScheduleStatus(item),
  };
}

/** Campos de Payable atualizáveis a partir de um schedule Nibo. */
export function payableFieldsFromNibo(item: NiboScheduleItem) {
  const amount = amountString(item.value);
  return {
    description: item.description,
    originalAmount: amount,
    paidAmount: amountString(Math.min(item.paidValue, item.value)),
    dueDate: new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`),
    status: niboScheduleStatus(item),
    supplierName: item.stakeholderName ?? undefined,
    notes: buildPayableNotes(item),
  };
}

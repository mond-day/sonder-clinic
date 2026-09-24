/**
 * Helpers espelhados de apps/api/.../nibo-import.utils.ts para o worker
 * (worker não depende de @sonder/api). Manter comportamento alinhado.
 */

export const NIBO_FALLBACK_PATIENT_NAME = 'Importação Nibo (sem paciente)';
export const NIBO_FALLBACK_PATIENT_PHONE = '00000000000';
export const NIBO_IMPORT_PATIENT_PHONE = 'NIBO-IMPORT';

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function niboDocumentAsCpf(value: string | null | undefined): string | null {
  const digits = normalizeDocument(value);
  return digits.length === 11 ? digits : null;
}

export function hasUsableNiboIdentity(input: {
  stakeholderName: string | null;
  stakeholderDocument: string | null;
}): boolean {
  const name = input.stakeholderName?.trim() ?? '';
  const doc = normalizeDocument(input.stakeholderDocument);
  return Boolean(name) || doc.length >= 11;
}

export function amountString(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  return value.toFixed(2);
}

export function dueDateOnly(isoOrDate: string): string {
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function scheduleStatus(item: {
  isPaid: boolean;
  value: number;
  paidValue: number;
}): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (item.isPaid || (item.value > 0 && item.paidValue >= item.value)) return 'PAID';
  if (item.paidValue > 0) return 'PARTIALLY_PAID';
  return 'OPEN';
}

export function normalizePatientNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildReceivableDescription(item: {
  scheduleId: string;
  description: string;
  stakeholderName: string | null;
}): string {
  const stakeholder = item.stakeholderName?.trim();
  const description = item.description?.trim() || `Agendamento Nibo ${item.scheduleId}`;
  if (stakeholder) return `${stakeholder} — ${description}`;
  return description;
}

export function buildPayableDescription(item: {
  scheduleId: string;
  description: string;
  stakeholderName: string | null;
}): string {
  return buildReceivableDescription(item);
}

/**
 * Centros de custo: vazio = importa todos; preenchido = só IDs da lista (sem CC = exclui).
 */
export function matchesFilters(
  item: { categoryId: string | null; costCenterId: string | null },
  filters: { categoryIds: string[]; costCenterIds: string[] },
): boolean {
  if (filters.categoryIds.length) {
    const categoryId = (item.categoryId ?? '').trim().toLowerCase();
    if (!categoryId || !filters.categoryIds.includes(categoryId)) return false;
  }
  if (filters.costCenterIds.length) {
    const costCenterId = (item.costCenterId ?? '').trim().toLowerCase();
    if (!costCenterId || !filters.costCenterIds.includes(costCenterId)) return false;
  }
  return true;
}

export type NiboPatientLinkDecision =
  | { action: 'use_existing'; patientId: string; via: 'cpf' | 'name' }
  | { action: 'create'; fullName: string; cpf: string | null }
  | { action: 'fallback' };

export function decideNiboPatientLink(input: {
  stakeholderName: string | null | undefined;
  stakeholderDocument: string | null | undefined;
  patientsByCpf: Map<string, string>;
  patientsByName: Map<string, string>;
}): NiboPatientLinkDecision {
  const name = (input.stakeholderName ?? '').trim();
  const cpf = niboDocumentAsCpf(input.stakeholderDocument);
  const hasIdentity = Boolean(name) || Boolean(cpf) || normalizeDocument(input.stakeholderDocument).length >= 11;

  if (cpf) {
    const existing = input.patientsByCpf.get(cpf);
    if (existing) return { action: 'use_existing', patientId: existing, via: 'cpf' };
  }

  const nameKey = normalizePatientNameKey(name);
  if (nameKey && nameKey !== normalizePatientNameKey(NIBO_FALLBACK_PATIENT_NAME)) {
    const byName = input.patientsByName.get(nameKey);
    if (byName) return { action: 'use_existing', patientId: byName, via: 'name' };
  }

  if (!hasIdentity) return { action: 'fallback' };

  return {
    action: 'create',
    fullName: name || (cpf ? `Paciente CPF ${cpf}` : `Paciente Nibo ${normalizeDocument(input.stakeholderDocument)}`),
    cpf,
  };
}

export function niboPaymentIdempotencyKey(scheduleId: string): string {
  return `nibo-schedule:${scheduleId}`;
}

export function niboPayablePaymentMarker(scheduleId: string): string {
  return `nibo-schedule:${scheduleId}`;
}

export function shouldCreateNiboSettlement(item: {
  paidValue: number;
  value: number;
  isPaid: boolean;
}): boolean {
  const status = scheduleStatus(item);
  if (status !== 'PAID' && status !== 'PARTIALLY_PAID') return false;
  // isPaid sem paidValue (quirk da API) → trata como valor integral.
  return item.paidValue > 0 || item.isPaid;
}

export function niboSettlementAmount(item: { paidValue: number; value: number; isPaid?: boolean }): string {
  const paid = item.paidValue > 0 ? item.paidValue : item.isPaid ? item.value : 0;
  return amountString(Math.min(Math.max(paid, 0), Math.max(item.value, 0)));
}

export function niboSettlementPaidAt(item: { dueDate: string }): Date {
  return new Date(`${dueDateOnly(item.dueDate)}T12:00:00Z`);
}

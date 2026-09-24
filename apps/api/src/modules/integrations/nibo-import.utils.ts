/**
 * Helpers puros para importação Nibo → Financeiro.
 *
 * Filtros:
 * - Categorias de recebíveis: só crédito.
 * - Categorias de pagáveis: só débito (se não configuradas, não filtra débito por categoria —
 *   evita sumir contas a pagar quando só categorias de receita estavam selecionadas).
 * - Centros de custo: só débito. Sem centros selecionados → importa todos os débitos.
 *   Com centros selecionados → só itens cujo costCenterId está na lista (sem CC no Nibo = exclui).
 */

import type { NiboScheduleItem } from '../../integrations/nibo-schedules';

export const NIBO_FALLBACK_PATIENT_NAME = 'Importação Nibo (sem paciente)';
export const NIBO_FALLBACK_PATIENT_PHONE = '00000000000';
/** Telefone placeholder que não colide em detecção de duplicados por dígitos. */
export const NIBO_IMPORT_PATIENT_PHONE = 'NIBO-IMPORT';

export function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** CPF (11 dígitos). CNPJ e outros documentos não entram no campo Patient.cpf. */
export function niboDocumentAsCpf(value: string | null | undefined): string | null {
  const digits = normalizeDocument(value);
  return digits.length === 11 ? digits : null;
}

export function hasUsableNiboIdentity(item: Pick<NiboScheduleItem, 'stakeholderName' | 'stakeholderDocument'>): boolean {
  const name = item.stakeholderName?.trim() ?? '';
  const doc = normalizeDocument(item.stakeholderDocument);
  return Boolean(name) || doc.length >= 11;
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

/** Normaliza IDs Nibo para comparação (GUID pode vir com casing diferente no catálogo vs schedule). */
export function normalizeNiboId(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function readNiboIdList(
  config: Record<string, unknown> | undefined,
  arrayKey: string,
  singularKey?: string,
): string[] {
  if (!config) return [];
  const raw = config[arrayKey];
  if (Array.isArray(raw)) {
    return [...new Set(
      raw.map((item) => normalizeNiboId(String(item ?? ''))).filter(Boolean),
    )];
  }
  if (singularKey) {
    const single = normalizeNiboId(String(config[singularKey] ?? ''));
    return single ? [single] : [];
  }
  return [];
}

/**
 * Categorias de crédito (a receber).
 */
export function readNiboReceivableCategoryIds(config: Record<string, unknown> | undefined): string[] {
  return readNiboIdList(config, 'receivableCategoryIds', 'receivableCategoryId');
}

/**
 * Categorias de débito (a pagar).
 * Se `payableCategoryIds` nunca foi gravado, retorna lista vazia (= sem filtro de categoria no débito).
 * Isso corrige o caso em que só categorias de receita estavam selecionadas e despesas sumiam.
 */
export function readNiboPayableCategoryIds(config: Record<string, unknown> | undefined): string[] {
  if (!config) return [];
  if (Array.isArray(config.payableCategoryIds) || typeof config.payableCategoryId === 'string') {
    return readNiboIdList(config, 'payableCategoryIds', 'payableCategoryId');
  }
  return [];
}

/**
 * @param filters.costCenterIds — vazio = sem filtro de CC.
 *   Preenchido = exige costCenterId na lista (itens sem centro no Nibo são excluídos).
 */
export function matchesNiboFilters(
  item: NiboScheduleItem,
  filters: { categoryIds: string[]; costCenterIds: string[] },
): boolean {
  if (filters.categoryIds.length) {
    const categoryId = normalizeNiboId(item.categoryId);
    if (!categoryId || !filters.categoryIds.includes(categoryId)) return false;
  }
  if (filters.costCenterIds.length) {
    const costCenterId = normalizeNiboId(item.costCenterId);
    if (!costCenterId || !filters.costCenterIds.includes(costCenterId)) return false;
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

/** Formato amigável: contato + descrição. */
export function buildReceivableDescription(item: NiboScheduleItem): string {
  const stakeholder = item.stakeholderName?.trim();
  const description = item.description?.trim() || `Agendamento Nibo ${item.scheduleId}`;
  if (stakeholder) return `${stakeholder} — ${description}`;
  return description;
}

/** Mesmo formato contato + descrição para contas a pagar. */
export function buildPayableDescription(item: NiboScheduleItem): string {
  const stakeholder = item.stakeholderName?.trim();
  const description = item.description?.trim() || `Agendamento Nibo ${item.scheduleId}`;
  if (stakeholder) return `${stakeholder} — ${description}`;
  return description;
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
    description: buildPayableDescription(item),
    originalAmount: amount,
    paidAmount: amountString(Math.min(item.paidValue, item.value)),
    dueDate: new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`),
    status: niboScheduleStatus(item),
    supplierName: item.stakeholderName ?? undefined,
    notes: buildPayableNotes(item),
  };
}

export type NiboPatientLinkDecision =
  | { action: 'use_existing'; patientId: string; via: 'cpf' | 'name' }
  | { action: 'create'; fullName: string; cpf: string | null }
  | { action: 'fallback' };

/**
 * Decide vínculo paciente: CPF → nome exato (cache) → criar → fallback sem identidade.
 */
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

export function normalizePatientNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function niboPaymentIdempotencyKey(scheduleId: string): string {
  return `nibo-schedule:${scheduleId}`;
}

export function niboPayablePaymentMarker(scheduleId: string): string {
  return `nibo-schedule:${scheduleId}`;
}

/** PAID ou parcial com valor pago → materializar Payment/PayablePayment no fluxo de caixa. */
export function shouldCreateNiboSettlement(item: Pick<NiboScheduleItem, 'paidValue' | 'value' | 'isPaid'>): boolean {
  const status = niboScheduleStatus(item as NiboScheduleItem);
  if (status !== 'PAID' && status !== 'PARTIALLY_PAID') return false;
  // isPaid sem paidValue (quirk da API) → trata como valor integral.
  return item.paidValue > 0 || item.isPaid;
}

export function niboSettlementAmount(item: Pick<NiboScheduleItem, 'paidValue' | 'value' | 'isPaid'>): string {
  const paid = item.paidValue > 0 ? item.paidValue : item.isPaid ? item.value : 0;
  return amountString(Math.min(Math.max(paid, 0), Math.max(item.value, 0)));
}

export function niboSettlementPaidAt(item: Pick<NiboScheduleItem, 'dueDate'>): Date {
  return new Date(`${dueDateOnly(item.dueDate)}T12:00:00Z`);
}

/** Mapeia intervalType Nibo (0–3) → frequência Sonder. */
export function niboRecurrenceFrequency(intervalType: number | null | undefined): 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' {
  switch (intervalType) {
    case 0: return 'DAILY';
    case 1: return 'WEEKLY';
    case 3: return 'YEARLY';
    case 2:
    default: return 'MONTHLY';
  }
}

export function niboRecurrenceFieldsFromSchedule(
  item: NiboScheduleItem,
  kind: 'PAYABLE' | 'RECEIVABLE',
): {
  kind: 'PAYABLE' | 'RECEIVABLE';
  description: string;
  amount: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  nextOccurrence: Date;
  endsAt: Date | null;
  metadata: Record<string, unknown>;
} | null {
  if (!item.hasRecurrence) return null;
  const recurrenceKey = normalizeNiboId(item.recurrenceId) || normalizeNiboId(item.scheduleId);
  if (!recurrenceKey) return null;
  const description = (item.description || '').trim() || `Recorrência Nibo ${recurrenceKey}`;
  return {
    kind,
    description,
    amount: amountString(item.value),
    frequency: niboRecurrenceFrequency(item.recurrenceIntervalType),
    interval: Math.max(1, item.recurrenceInterval ?? 1),
    nextOccurrence: new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`),
    endsAt: item.recurrenceEndDate
      ? new Date(`${dueDateOnly(item.recurrenceEndDate)}T00:00:00Z`)
      : null,
    metadata: {
      source: 'NIBO',
      generateLocally: false,
      niboRecurrenceId: recurrenceKey,
      niboScheduleId: item.scheduleId,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      supplierName: kind === 'PAYABLE' ? item.stakeholderName : undefined,
    },
  };
}

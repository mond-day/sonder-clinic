/**
 * Leitura e espelho de schedules Nibo (credit = a receber, debit = a pagar).
 * Import Nibo→Sonder: fetchNiboSchedules. Push Sonder→Nibo: outbox finance.nibo-sync (worker).
 */

import { fetchJson, integrationMockFlag, pickString, asRecord } from './http';
import { niboAuthHeaders, niboUrl } from './adapters';

export type NiboScheduleKind = 'credit' | 'debit';

export type NiboScheduleItem = {
  scheduleId: string;
  description: string;
  value: number;
  paidValue: number;
  openValue: number;
  isPaid: boolean;
  dueDate: string;
  categoryId: string | null;
  categoryName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  stakeholderName: string | null;
  stakeholderDocument: string | null;
  /** Agendamento gerado por recorrência no Nibo. */
  hasRecurrence: boolean;
  recurrenceId: string | null;
  recurrenceInterval: number | null;
  /** 0 = dia, 1 = semana, 2 = mês, 3 = ano */
  recurrenceIntervalType: number | null;
  recurrenceEndDate: string | null;
};

export type FetchNiboSchedulesResult = {
  items: NiboScheduleItem[];
  source: 'live' | 'unavailable';
  message?: string;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function niboBaseUrl() {
  return (process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1').replace(/\/$/, '');
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstCostCenter(row: Record<string, unknown>): { id: string | null; name: string | null } {
  const nested = asRecord(row.costCenter);
  if (nested) {
    return {
      id: pickString(nested.id, nested.costCenterId) || null,
      name: pickString(nested.description, nested.name) || null,
    };
  }
  const list = Array.isArray(row.costCenters) ? row.costCenters : [];
  for (const entry of list) {
    const item = asRecord(entry);
    if (!item || item.isDeleted === true) continue;
    const id = pickString(item.costCenterId, item.id);
    if (!id) continue;
    return { id, name: pickString(item.costCenterDescription, item.description, item.name) || null };
  }
  return { id: null, name: null };
}

function firstCategory(row: Record<string, unknown>): { id: string | null; name: string | null } {
  const nested = asRecord(row.category);
  if (nested) {
    return {
      id: pickString(nested.id, nested.categoryId) || null,
      name: pickString(nested.name, nested.categoryName, nested.description) || null,
    };
  }
  const list = Array.isArray(row.categories) ? row.categories : [];
  for (const entry of list) {
    const item = asRecord(entry);
    if (!item || item.isDeleted === true) continue;
    const id = pickString(item.categoryId, item.id);
    if (!id) continue;
    return { id, name: pickString(item.categoryName, item.name, item.description) || null };
  }
  return { id: null, name: null };
}

function parseRecurrence(row: Record<string, unknown>): {
  hasRecurrence: boolean;
  recurrenceId: string | null;
  recurrenceInterval: number | null;
  recurrenceIntervalType: number | null;
  recurrenceEndDate: string | null;
} {
  const nested = asRecord(row.recurrence);
  const hasRecurrence = row.hasRecurrence === true || Boolean(nested);
  if (!hasRecurrence) {
    return {
      hasRecurrence: false,
      recurrenceId: null,
      recurrenceInterval: null,
      recurrenceIntervalType: null,
      recurrenceEndDate: null,
    };
  }
  const interval = nested ? asNumber(nested.interval) : 0;
  const intervalTypeRaw = nested ? nested.intervalType : null;
  const intervalType = typeof intervalTypeRaw === 'number' && Number.isFinite(intervalTypeRaw)
    ? intervalTypeRaw
    : null;
  return {
    hasRecurrence: true,
    recurrenceId: nested ? pickString(nested.id, nested.recurrenceId) || null : null,
    recurrenceInterval: interval > 0 ? interval : 1,
    recurrenceIntervalType: intervalType,
    recurrenceEndDate: nested ? pickString(nested.endDate) || null : null,
  };
}

export function parseNiboScheduleRow(raw: unknown): NiboScheduleItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const scheduleId = pickString(row.scheduleId, row.id);
  if (!scheduleId) return null;
  const category = firstCategory(row);
  const costCenter = firstCostCenter(row);
  const stakeholder = asRecord(row.stakeholder);
  const value = asNumber(row.value);
  const paidValue = asNumber(row.paidValue);
  const openValue = asNumber(row.openValue);
  const dueDate = pickString(row.dueDate, row.scheduleDate, row.accrualDate);
  if (!dueDate) return null;
  const recurrence = parseRecurrence(row);
  return {
    scheduleId,
    description: pickString(row.description) || `Agendamento Nibo ${scheduleId}`,
    value,
    paidValue,
    openValue: openValue || Math.max(0, value - paidValue),
    isPaid: row.isPaid === true || (value > 0 && paidValue >= value),
    dueDate,
    categoryId: category.id,
    categoryName: category.name,
    costCenterId: costCenter.id,
    costCenterName: costCenter.name,
    stakeholderName: stakeholder ? pickString(stakeholder.name) || null : null,
    stakeholderDocument: stakeholder
      ? pickString(stakeholder.cpfCnpj, stakeholder.document, stakeholder.taxId) || null
      : null,
    ...recurrence,
  };
}

function scheduleItemsFromBody(body: unknown): NiboScheduleItem[] {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? ((body as { items?: unknown }).items ?? [])
      : [];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = parseNiboScheduleRow(row);
    return parsed ? [parsed] : [];
  });
}

export async function fetchNiboSchedules(
  apiKey: string,
  kind: NiboScheduleKind,
  options?: { maxPages?: number },
): Promise<FetchNiboSchedulesResult> {
  const key = apiKey.trim();
  const mock = integrationMockFlag('NIBO_MOCK');
  if (!key) {
    return {
      items: [],
      source: 'unavailable',
      message: mock
        ? 'Nibo em modo MOCK sem API Key. Informe a chave da conexão ou desative NIBO_MOCK.'
        : 'Informe a API Key do Nibo para importar lançamentos.',
    };
  }

  const baseUrl = niboBaseUrl();
  const headers = niboAuthHeaders(key);
  const path = kind === 'credit' ? '/schedules/credit' : '/schedules/debit';
  const maxPages = options?.maxPages ?? MAX_PAGES;
  const items: NiboScheduleItem[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const skip = page * PAGE_SIZE;
    const query = `$orderby=dueDate&$top=${PAGE_SIZE}&$skip=${skip}`;
    try {
      const result = await fetchJson(niboUrl(baseUrl, `${path}?${query}`, key), { headers });
      if (!result.ok) {
        return {
          items,
          source: items.length ? 'live' : 'unavailable',
          message: items.length
            ? `Importação parcial: Nibo retornou HTTP ${result.status} na página ${page + 1}.`
            : `Falha ao listar schedules Nibo (${kind}) HTTP ${result.status}.`,
        };
      }
      const pageItems = scheduleItemsFromBody(result.body);
      items.push(...pageItems);
      if (pageItems.length < PAGE_SIZE) break;
    } catch (error) {
      return {
        items,
        source: items.length ? 'live' : 'unavailable',
        message: `Erro ao contatar Nibo: ${error instanceof Error ? error.message : 'desconhecido'}`,
      };
    }
  }

  return {
    items,
    source: 'live',
    message: items.length ? undefined : `Nenhum agendamento ${kind === 'credit' ? 'a receber' : 'a pagar'} retornado pelo Nibo.`,
  };
}

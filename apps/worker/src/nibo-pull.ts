/**
 * Pull periódico Nibo → Sonder: enfileira finance.nibo-pull.requested
 * e aplica create/update de schedules (sem push de volta).
 */

import { Prisma, prisma } from '@sonder/database';
import {
  decryptNiboCredentials,
  isNiboMock,
  readNiboApiKey,
  readNiboIdList,
} from './nibo-sync';

const NIBO_PULL_EVENT = 'finance.nibo-pull.requested';
const FALLBACK_PATIENT_NAME = 'Importação Nibo (sem paciente)';
const FALLBACK_PATIENT_PHONE = '00000000000';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export function isNiboPullEnabled(): boolean {
  const raw = (process.env.NIBO_PULL_ENABLED ?? 'true').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function niboPullIntervalMs(): number {
  const raw = Number(process.env.NIBO_PULL_INTERVAL_MS ?? String(30 * 60_000));
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 30 * 60_000;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function niboBaseUrl() {
  return (process.env.NIBO_BASE_URL ?? 'https://api.nibo.com.br/empresas/v1').replace(/\/$/, '');
}

function niboAuthHeaders(apiKey: string): Record<string, string> {
  return { ApiToken: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' };
}

function niboUrl(path: string, apiKey: string): string {
  const root = niboBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = `${root}${suffix}`;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}apitoken=${encodeURIComponent(apiKey)}`;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { ok: response.ok, status: response.status, body };
}

type ScheduleItem = {
  scheduleId: string;
  description: string;
  value: number;
  paidValue: number;
  isPaid: boolean;
  dueDate: string;
  categoryId: string | null;
  costCenterId: string | null;
  stakeholderName: string | null;
  stakeholderDocument: string | null;
};

function parseScheduleRow(raw: unknown): ScheduleItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const scheduleId = pickString(row.scheduleId, row.id);
  if (!scheduleId) return null;
  const dueDate = pickString(row.dueDate, row.scheduleDate, row.accrualDate);
  if (!dueDate) return null;
  const categoryList = Array.isArray(row.categories) ? row.categories : [];
  let categoryId: string | null = null;
  const nestedCat = asRecord(row.category);
  if (nestedCat) categoryId = pickString(nestedCat.id, nestedCat.categoryId) || null;
  if (!categoryId) {
    for (const entry of categoryList) {
      const item = asRecord(entry);
      if (!item || item.isDeleted === true) continue;
      categoryId = pickString(item.categoryId, item.id) || null;
      if (categoryId) break;
    }
  }
  const ccList = Array.isArray(row.costCenters) ? row.costCenters : [];
  let costCenterId: string | null = null;
  const nestedCc = asRecord(row.costCenter);
  if (nestedCc) costCenterId = pickString(nestedCc.id, nestedCc.costCenterId) || null;
  if (!costCenterId) {
    for (const entry of ccList) {
      const item = asRecord(entry);
      if (!item || item.isDeleted === true) continue;
      costCenterId = pickString(item.costCenterId, item.id) || null;
      if (costCenterId) break;
    }
  }
  const stakeholder = asRecord(row.stakeholder);
  const value = asNumber(row.value);
  const paidValue = asNumber(row.paidValue);
  return {
    scheduleId,
    description: pickString(row.description) || `Agendamento Nibo ${scheduleId}`,
    value,
    paidValue,
    isPaid: row.isPaid === true || (value > 0 && paidValue >= value),
    dueDate,
    categoryId,
    costCenterId,
    stakeholderName: stakeholder ? pickString(stakeholder.name) || null : null,
    stakeholderDocument: stakeholder
      ? pickString(stakeholder.cpfCnpj, stakeholder.document, stakeholder.taxId) || null
      : null,
  };
}

async function fetchSchedules(apiKey: string, kind: 'credit' | 'debit'): Promise<ScheduleItem[]> {
  const path = kind === 'credit' ? '/schedules/credit' : '/schedules/debit';
  const items: ScheduleItem[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const skip = page * PAGE_SIZE;
    const query = `$orderby=dueDate&$top=${PAGE_SIZE}&$skip=${skip}`;
    const result = await fetchJson(niboUrl(`${path}?${query}`, apiKey), {
      headers: niboAuthHeaders(apiKey),
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    });
    if (!result.ok) {
      if (items.length) break;
      throw new Error(`Nibo listar schedules ${kind} falhou (HTTP ${result.status}).`);
    }
    const rows = Array.isArray(result.body)
      ? result.body
      : asRecord(result.body)?.items;
    if (!Array.isArray(rows)) break;
    for (const row of rows) {
      const parsed = parseScheduleRow(row);
      if (parsed) items.push(parsed);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return items;
}

function matchesFilters(
  item: ScheduleItem,
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

function scheduleStatus(item: ScheduleItem): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  if (item.isPaid || (item.value > 0 && item.paidValue >= item.value)) return 'PAID';
  if (item.paidValue > 0) return 'PARTIALLY_PAID';
  return 'OPEN';
}

function amountString(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0.00';
  return value.toFixed(2);
}

function dueDateOnly(isoOrDate: string): string {
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function normalizeDocument(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export type NiboPullEnqueueResult = {
  checked: number;
  enqueued: number;
  skipped: number;
  niboMock: boolean;
  pullEnabled: boolean;
  skipReason?: string;
  inactiveOrMissingCred?: number;
};

/**
 * Enfileira pull para conexões Nibo ACTIVE cujo lastNiboPullAt passou do intervalo.
 * Lease atômico em configuration.niboPullLeaseUntil.
 */
export async function enqueueDueNiboPulls(now = new Date()): Promise<NiboPullEnqueueResult> {
  const pullEnabled = isNiboPullEnabled();
  const niboMock = isNiboMock();
  if (!pullEnabled) {
    return {
      checked: 0,
      enqueued: 0,
      skipped: 0,
      niboMock,
      pullEnabled: false,
      skipReason: 'NIBO_PULL_ENABLED=false',
    };
  }
  if (niboMock) {
    return {
      checked: 0,
      enqueued: 0,
      skipped: 0,
      niboMock: true,
      pullEnabled: true,
      skipReason: 'NIBO_MOCK=true (pull automático desligado)',
    };
  }

  const intervalMs = niboPullIntervalMs();
  const allNibo = await prisma.integrationConnection.findMany({
    where: { provider: 'NIBO' },
    select: {
      id: true,
      status: true,
      encryptedCredentials: true,
      configuration: true,
    },
    take: 50,
  });
  const connections = allNibo.filter(
    (row) => row.status === 'ACTIVE' && Boolean(row.encryptedCredentials),
  );
  const inactiveOrMissingCred = allNibo.length - connections.length;

  if (!connections.length) {
    return {
      checked: 0,
      enqueued: 0,
      skipped: 0,
      niboMock: false,
      pullEnabled: true,
      inactiveOrMissingCred,
      skipReason: allNibo.length
        ? `nenhuma conexão Nibo ACTIVE com credenciais (${allNibo.length} existente(s), status≠ACTIVE ou sem key)`
        : 'nenhuma conexão Nibo cadastrada',
    };
  }

  let enqueued = 0;
  let skipped = 0;

  for (const connection of connections) {
    const config =
      connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
        ? { ...(connection.configuration as Record<string, unknown>) }
        : {};

    const leaseUntilRaw = pickString(config.niboPullLeaseUntil);
    if (leaseUntilRaw && new Date(leaseUntilRaw) > now) {
      skipped += 1;
      continue;
    }

    const lastPullRaw = pickString(config.lastNiboPullAt, config.lastNiboImportAt);
    const lastPull = lastPullRaw ? new Date(lastPullRaw) : null;
    if (lastPull && Number.isFinite(lastPull.getTime()) && now.getTime() - lastPull.getTime() < intervalMs) {
      skipped += 1;
      continue;
    }

    const leaseUntil = new Date(now.getTime() + 10 * 60_000).toISOString();
    const claimed = await prisma.$executeRaw`
      UPDATE "IntegrationConnection"
      SET "configuration" = COALESCE("configuration", '{}'::jsonb)
        || jsonb_build_object('niboPullLeaseUntil', ${leaseUntil}::text)
      WHERE "id" = ${connection.id}::uuid
        AND "status" = 'ACTIVE'
        AND (
          "configuration" IS NULL
          OR "configuration"->>'niboPullLeaseUntil' IS NULL
          OR ("configuration"->>'niboPullLeaseUntil')::timestamptz <= ${now}
        )
    `;
    if (Number(claimed) !== 1) {
      skipped += 1;
      continue;
    }

    await prisma.outboxEvent.create({
      data: {
        aggregateType: 'IntegrationConnection',
        aggregateId: connection.id,
        eventType: NIBO_PULL_EVENT,
        payload: { connectionId: connection.id },
      },
    });
    enqueued += 1;
  }

  return {
    checked: connections.length,
    enqueued,
    skipped,
    niboMock: false,
    pullEnabled: true,
    inactiveOrMissingCred,
    skipReason: enqueued === 0 && skipped > 0
      ? 'todas as conexões ACTIVE ainda dentro do intervalo ou com lease ativo'
      : undefined,
  };
}

async function ensureFallbackPatient(organizationId: string, clinicId: string): Promise<string> {
  const existing = await prisma.patient.findFirst({
    where: {
      organizationId,
      fullName: FALLBACK_PATIENT_NAME,
      status: { not: 'ARCHIVED' },
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.patientClinic.upsert({
      where: { patientId_clinicId: { patientId: existing.id, clinicId } },
      create: { patientId: existing.id, clinicId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return existing.id;
  }
  const created = await prisma.patient.create({
    data: {
      organizationId,
      fullName: FALLBACK_PATIENT_NAME,
      primaryPhone: FALLBACK_PATIENT_PHONE,
      status: 'ACTIVE',
      clinics: { create: { clinicId, status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Processa um evento finance.nibo-pull.requested (create + update).
 */
export async function processNiboPullConnection(connectionId: string): Promise<{
  receivablesCreated: number;
  receivablesUpdated: number;
  payablesCreated: number;
  payablesUpdated: number;
  creditFetched?: number;
  debitFetched?: number;
  creditMatchedFilters?: number;
  debitMatchedFilters?: number;
  message: string;
}> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, provider: 'NIBO', status: 'ACTIVE' },
    include: { clinic: { select: { organizationId: true } } },
  });
  if (!connection?.encryptedCredentials) {
    return {
      receivablesCreated: 0,
      receivablesUpdated: 0,
      payablesCreated: 0,
      payablesUpdated: 0,
      message: 'Conexão Nibo ausente ou inativa.',
    };
  }

  const credentials = decryptNiboCredentials(connection.encryptedCredentials);
  const apiKey = readNiboApiKey(credentials);
  if (!apiKey) {
    return {
      receivablesCreated: 0,
      receivablesUpdated: 0,
      payablesCreated: 0,
      payablesUpdated: 0,
      message: 'Conexão Nibo sem API Key.',
    };
  }

  const organizationId = connection.clinic.organizationId;
  const clinicId = connection.clinicId;
  const config =
    connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
      ? { ...(connection.configuration as Record<string, unknown>) }
      : {};
  const categoryIds = readNiboIdList(config, 'receivableCategoryIds', 'receivableCategoryId');
  const costCenterIds = readNiboIdList(config, 'costCenterIds', 'costCenterId');
  // Categorias filtram crédito e débito; centros de custo filtram só débito (a pagar).
  const creditFilters = { categoryIds, costCenterIds: [] as string[] };
  const debitFilters = { categoryIds, costCenterIds };

  const [creditItems, debitItems] = await Promise.all([
    fetchSchedules(apiKey, 'credit'),
    fetchSchedules(apiKey, 'debit'),
  ]);

  const credits = creditItems.filter((item) => matchesFilters(item, creditFilters));
  const debits = debitItems.filter((item) => matchesFilters(item, debitFilters));

  const fallbackPatientId = await ensureFallbackPatient(organizationId, clinicId);
  const patients = await prisma.patient.findMany({
    where: { organizationId, status: { not: 'ARCHIVED' }, cpf: { not: null } },
    select: { id: true, cpf: true },
    take: 5000,
  });
  const patientsByCpf = new Map<string, string>();
  for (const patient of patients) {
    const doc = normalizeDocument(patient.cpf);
    if (doc) patientsByCpf.set(doc, patient.id);
  }

  let receivablesCreated = 0;
  let receivablesUpdated = 0;
  let payablesCreated = 0;
  let payablesUpdated = 0;

  for (const item of credits) {
    const amount = amountString(item.value);
    const dueDate = new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`);
    const status = scheduleStatus(item);
    const stakeholder = item.stakeholderName?.trim();
    const description =
      stakeholder && !item.description.toLowerCase().includes(stakeholder.toLowerCase())
        ? `${item.description} — ${stakeholder}`
        : item.description;

    const existing = await prisma.receivable.findFirst({
      where: { organizationId, clinicId, externalId: item.scheduleId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'CANCELLED') continue;
      await prisma.receivable.update({
        where: { id: existing.id },
        data: {
          description,
          originalAmount: amount,
          discount: '0',
          surcharge: '0',
          netAmount: amount,
          dueDate,
          status,
          provider: 'NIBO',
        },
      });
      receivablesUpdated += 1;
      continue;
    }
    const doc = normalizeDocument(item.stakeholderDocument);
    const patientId = (doc && patientsByCpf.get(doc)) || fallbackPatientId;
    await prisma.receivable.create({
      data: {
        organizationId,
        clinicId,
        patientId,
        description,
        originalAmount: amount,
        discount: '0',
        surcharge: '0',
        netAmount: amount,
        dueDate,
        status,
        provider: 'NIBO',
        externalId: item.scheduleId,
      },
    });
    receivablesCreated += 1;
  }

  for (const item of debits) {
    const amount = amountString(item.value);
    const paidAmount = amountString(Math.min(item.paidValue, item.value));
    const dueDate = new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`);
    const status = scheduleStatus(item);
    const notes = [
      `Importado do Nibo (scheduleId=${item.scheduleId})`,
      item.stakeholderName ? `Fornecedor: ${item.stakeholderName}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const existing = await prisma.payable.findFirst({
      where: { organizationId, clinicId, externalId: item.scheduleId },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === 'CANCELLED') continue;
      await prisma.payable.update({
        where: { id: existing.id },
        data: {
          description: item.description,
          originalAmount: amount,
          paidAmount,
          dueDate,
          status,
          supplierName: item.stakeholderName ?? undefined,
          notes,
          provider: 'NIBO',
        },
      });
      payablesUpdated += 1;
      continue;
    }
    await prisma.payable.create({
      data: {
        organizationId,
        clinicId,
        description: item.description,
        originalAmount: amount,
        paidAmount,
        dueDate,
        status,
        supplierName: item.stakeholderName ?? undefined,
        notes,
        provider: 'NIBO',
        externalId: item.scheduleId,
      },
    });
    payablesCreated += 1;
  }

  const pulledAt = new Date().toISOString();
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      lastSyncAt: new Date(),
      configuration: {
        ...config,
        lastNiboPullAt: pulledAt,
        lastNiboImportAt: pulledAt,
        niboPullLeaseUntil: null,
        lastNiboImport: {
          receivablesCreated,
          receivablesUpdated,
          payablesCreated,
          payablesUpdated,
          creditFetched: creditItems.length,
          debitFetched: debitItems.length,
          creditMatchedFilters: credits.length,
          debitMatchedFilters: debits.length,
          source: 'worker-pull',
        },
      } as Prisma.InputJsonValue,
    },
  });

  return {
    receivablesCreated,
    receivablesUpdated,
    payablesCreated,
    payablesUpdated,
    creditFetched: creditItems.length,
    debitFetched: debitItems.length,
    creditMatchedFilters: credits.length,
    debitMatchedFilters: debits.length,
    message: [
      `Pull Nibo: R ${receivablesCreated}+${receivablesUpdated} / P ${payablesCreated}+${payablesUpdated}`,
      `(fetched C${creditItems.length}/D${debitItems.length}, matched C${credits.length}/D${debits.length})`,
      categoryIds.length || costCenterIds.length
        ? `filtros: ${categoryIds.length} cat, ${costCenterIds.length} CC`
        : 'sem filtros de categoria/CC',
    ].join(' '),
  };
}

export { NIBO_PULL_EVENT };

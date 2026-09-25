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
  readNiboPayableCategoryIds,
  readNiboReceivableCategoryIds,
} from './nibo-sync';
import {
  NIBO_FALLBACK_PATIENT_NAME,
  NIBO_FALLBACK_PATIENT_PHONE,
  NIBO_IMPORT_PATIENT_PHONE,
  amountString,
  buildPayableDescription,
  buildReceivableDescription,
  decideNiboPatientLink,
  dueDateOnly,
  matchesFilters,
  niboPayablePaymentMarker,
  niboPaymentIdempotencyKey,
  niboSettlementAmount,
  niboSettlementPaidAt,
  normalizeDocument,
  normalizePatientNameKey,
  scheduleStatus,
  shouldCreateNiboSettlement,
} from './nibo-import.utils';

const NIBO_PULL_EVENT = 'finance.nibo-pull.requested';
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
  categoryName: string | null;
  costCenterId: string | null;
  stakeholderName: string | null;
  stakeholderDocument: string | null;
  hasRecurrence: boolean;
  recurrenceId: string | null;
  recurrenceInterval: number | null;
  recurrenceIntervalType: number | null;
  recurrenceEndDate: string | null;
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
  let categoryName: string | null = null;
  const nestedCat = asRecord(row.category);
  if (nestedCat) {
    categoryId = pickString(nestedCat.id, nestedCat.categoryId) || null;
    categoryName = pickString(nestedCat.name, nestedCat.categoryName, nestedCat.description) || null;
  }
  if (!categoryId) {
    for (const entry of categoryList) {
      const item = asRecord(entry);
      if (!item || item.isDeleted === true) continue;
      categoryId = pickString(item.categoryId, item.id) || null;
      categoryName = pickString(item.categoryName, item.name, item.description) || null;
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
  if (!costCenterId) {
    costCenterId = pickString(row.costCenterId, row.CostCenterId) || null;
  }
  const stakeholder = asRecord(row.stakeholder);
  const value = asNumber(row.value);
  const paidValue = asNumber(row.paidValue);
  const recurrence = asRecord(row.recurrence);
  const recurrenceIdTop = pickString(row.recurrenceId, row.RecurrenceId);
  const hasRecurrence = row.hasRecurrence === true
    || row.isRecurrent === true
    || row.isRecurring === true
    || Boolean(recurrence)
    || Boolean(recurrenceIdTop);
  const intervalTypeRaw = recurrence?.intervalType;
  return {
    scheduleId,
    description: pickString(row.description) || `Agendamento Nibo ${scheduleId}`,
    value,
    paidValue,
    isPaid: row.isPaid === true || (value > 0 && paidValue >= value),
    dueDate,
    categoryId,
    categoryName,
    costCenterId,
    stakeholderName: stakeholder ? pickString(stakeholder.name) || null : null,
    stakeholderDocument: stakeholder
      ? pickString(stakeholder.cpfCnpj, stakeholder.document, stakeholder.taxId) || null
      : null,
    hasRecurrence,
    recurrenceId: (recurrence ? pickString(recurrence.id, recurrence.recurrenceId) : '') || recurrenceIdTop || null,
    recurrenceInterval: recurrence && asNumber(recurrence.interval) > 0 ? asNumber(recurrence.interval) : hasRecurrence ? 1 : null,
    recurrenceIntervalType: typeof intervalTypeRaw === 'number' && Number.isFinite(intervalTypeRaw) ? intervalTypeRaw : null,
    recurrenceEndDate: recurrence ? pickString(recurrence.endDate) || null : null,
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
      fullName: NIBO_FALLBACK_PATIENT_NAME,
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
      fullName: NIBO_FALLBACK_PATIENT_NAME,
      primaryPhone: NIBO_FALLBACK_PATIENT_PHONE,
      status: 'ACTIVE',
      clinics: { create: { clinicId, status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  return created.id;
}

async function loadPatientIndexes(organizationId: string) {
  const patients = await prisma.patient.findMany({
    where: { organizationId, status: { not: 'ARCHIVED' } },
    select: { id: true, cpf: true, fullName: true },
    take: 8000,
  });
  const patientsByCpf = new Map<string, string>();
  const patientsByName = new Map<string, string>();
  for (const patient of patients) {
    const doc = normalizeDocument(patient.cpf);
    if (doc) patientsByCpf.set(doc, patient.id);
    const nameKey = normalizePatientNameKey(patient.fullName);
    if (nameKey && nameKey !== normalizePatientNameKey(NIBO_FALLBACK_PATIENT_NAME) && !patientsByName.has(nameKey)) {
      patientsByName.set(nameKey, patient.id);
    }
  }
  return { patientsByCpf, patientsByName };
}

async function resolvePatientId(input: {
  organizationId: string;
  clinicId: string;
  item: ScheduleItem;
  fallbackPatientId: string;
  patientsByCpf: Map<string, string>;
  patientsByName: Map<string, string>;
}): Promise<{ patientId: string; created: boolean }> {
  const decision = decideNiboPatientLink({
    stakeholderName: input.item.stakeholderName,
    stakeholderDocument: input.item.stakeholderDocument,
    patientsByCpf: input.patientsByCpf,
    patientsByName: input.patientsByName,
  });
  if (decision.action === 'use_existing') {
    await prisma.patientClinic.upsert({
      where: { patientId_clinicId: { patientId: decision.patientId, clinicId: input.clinicId } },
      create: { patientId: decision.patientId, clinicId: input.clinicId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return { patientId: decision.patientId, created: false };
  }
  if (decision.action === 'fallback') {
    return { patientId: input.fallbackPatientId, created: false };
  }
  try {
    const created = await prisma.patient.create({
      data: {
        organizationId: input.organizationId,
        fullName: decision.fullName,
        cpf: decision.cpf,
        primaryPhone: NIBO_IMPORT_PATIENT_PHONE,
        status: 'ACTIVE',
        clinics: { create: { clinicId: input.clinicId, status: 'ACTIVE' } },
      },
      select: { id: true, fullName: true, cpf: true },
    });
    if (created.cpf) input.patientsByCpf.set(normalizeDocument(created.cpf), created.id);
    const nameKey = normalizePatientNameKey(created.fullName);
    if (nameKey) input.patientsByName.set(nameKey, created.id);
    return { patientId: created.id, created: true };
  } catch {
    if (decision.cpf) {
      const existing = await prisma.patient.findFirst({
        where: { organizationId: input.organizationId, cpf: decision.cpf, status: { not: 'ARCHIVED' } },
        select: { id: true },
      });
      if (existing) {
        input.patientsByCpf.set(decision.cpf, existing.id);
        return { patientId: existing.id, created: false };
      }
    }
    return { patientId: input.fallbackPatientId, created: false };
  }
}

async function ensureReceivableSettlement(receivableId: string, item: ScheduleItem): Promise<boolean> {
  if (!shouldCreateNiboSettlement(item)) return false;
  const key = niboPaymentIdempotencyKey(item.scheduleId);
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
  if (existing) return false;
  await prisma.payment.create({
    data: {
      receivableId,
      amount: niboSettlementAmount(item),
      method: 'NIBO',
      provider: 'NIBO',
      externalId: item.scheduleId,
      idempotencyKey: key,
      status: 'CONFIRMED',
      paidAt: niboSettlementPaidAt(item),
    },
  });
  return true;
}

async function ensurePayableSettlement(payableId: string, item: ScheduleItem): Promise<boolean> {
  if (!shouldCreateNiboSettlement(item)) return false;
  const marker = niboPayablePaymentMarker(item.scheduleId);
  const existing = await prisma.payablePayment.findFirst({
    where: { payableId, notes: { contains: marker } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.payablePayment.create({
    data: {
      payableId,
      amount: niboSettlementAmount(item),
      method: 'NIBO',
      notes: `Baixa importada do Nibo (${marker})`,
      status: 'CONFIRMED',
      paidAt: niboSettlementPaidAt(item),
    },
  });
  return true;
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
  const receivableCategoryIds = readNiboReceivableCategoryIds(config);
  const payableCategoryIds = readNiboPayableCategoryIds(config);
  const costCenterIds = readNiboIdList(config, 'costCenterIds', 'costCenterId');
  // Receita → crédito; despesa → débito; CC só no débito.
  const creditFilters = { categoryIds: receivableCategoryIds, costCenterIds: [] as string[] };
  const debitFilters = { categoryIds: payableCategoryIds, costCenterIds };

  const [creditItems, debitItems] = await Promise.all([
    fetchSchedules(apiKey, 'credit'),
    fetchSchedules(apiKey, 'debit'),
  ]);

  const credits = creditItems.filter((item) => matchesFilters(item, creditFilters));
  const debits = debitItems.filter((item) => matchesFilters(item, debitFilters));

  const fallbackPatientId = await ensureFallbackPatient(organizationId, clinicId);
  const { patientsByCpf, patientsByName } = await loadPatientIndexes(organizationId);

  let receivablesCreated = 0;
  let receivablesUpdated = 0;
  let payablesCreated = 0;
  let payablesUpdated = 0;
  let patientsCreated = 0;
  let settlementsCreated = 0;
  let recurrencesUpserted = 0;
  const seenRecurrenceKeys = new Set<string>();

  for (const item of credits) {
    if (await upsertNiboRecurrenceMirror(organizationId, clinicId, item, 'RECEIVABLE', seenRecurrenceKeys)) {
      recurrencesUpserted += 1;
    }
    const amount = amountString(item.value);
    const dueDate = new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`);
    const status = scheduleStatus(item);
    const description = buildReceivableDescription(item);

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
      if (await ensureReceivableSettlement(existing.id, item)) settlementsCreated += 1;
      continue;
    }
    const resolved = await resolvePatientId({
      organizationId,
      clinicId,
      item,
      fallbackPatientId,
      patientsByCpf,
      patientsByName,
    });
    if (resolved.created) patientsCreated += 1;
    const created = await prisma.receivable.create({
      data: {
        organizationId,
        clinicId,
        patientId: resolved.patientId,
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
      select: { id: true },
    });
    receivablesCreated += 1;
    if (await ensureReceivableSettlement(created.id, item)) settlementsCreated += 1;
  }

  for (const item of debits) {
    if (await upsertNiboRecurrenceMirror(organizationId, clinicId, item, 'PAYABLE', seenRecurrenceKeys)) {
      recurrencesUpserted += 1;
    }
    const amount = amountString(item.value);
    const paidAmount = amountString(Math.min(item.paidValue, item.value));
    const dueDate = new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`);
    const status = scheduleStatus(item);
    const description = buildPayableDescription(item);
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
          description,
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
      if (await ensurePayableSettlement(existing.id, item)) settlementsCreated += 1;
      continue;
    }
    const created = await prisma.payable.create({
      data: {
        organizationId,
        clinicId,
        description,
        originalAmount: amount,
        paidAmount,
        dueDate,
        status,
        supplierName: item.stakeholderName ?? undefined,
        notes,
        provider: 'NIBO',
        externalId: item.scheduleId,
      },
      select: { id: true },
    });
    payablesCreated += 1;
    if (await ensurePayableSettlement(created.id, item)) settlementsCreated += 1;
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
          patientsCreated,
          settlementsCreated,
          recurrencesUpserted,
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
      patientsCreated ? `pacientes+${patientsCreated}` : null,
      settlementsCreated ? `baixas+${settlementsCreated}` : null,
      recurrencesUpserted ? `recorrências+${recurrencesUpserted}` : null,
      `(fetched C${creditItems.length}/D${debitItems.length}, matched C${credits.length}/D${debits.length})`,
      receivableCategoryIds.length || payableCategoryIds.length || costCenterIds.length
        ? `filtros: ${receivableCategoryIds.length} cat-rec, ${payableCategoryIds.length} cat-pag, ${costCenterIds.length} CC`
        : 'sem filtros de categoria/CC',
    ].filter(Boolean).join(' '),
  };
}

async function upsertNiboRecurrenceMirror(
  organizationId: string,
  clinicId: string,
  item: ScheduleItem,
  kind: 'PAYABLE' | 'RECEIVABLE',
  seen: Set<string>,
): Promise<boolean> {
  if (!item.hasRecurrence) return false;
  const recurrenceKey = (item.recurrenceId || item.scheduleId).trim().toLowerCase();
  if (!recurrenceKey || seen.has(`${kind}:${recurrenceKey}`)) return false;
  seen.add(`${kind}:${recurrenceKey}`);

  const frequency = item.recurrenceIntervalType === 0
    ? 'DAILY'
    : item.recurrenceIntervalType === 1
      ? 'WEEKLY'
      : item.recurrenceIntervalType === 3
        ? 'YEARLY'
        : 'MONTHLY';
  const nextOccurrence = new Date(`${dueDateOnly(item.dueDate)}T00:00:00Z`);
  const endsAt = item.recurrenceEndDate
    ? new Date(`${dueDateOnly(item.recurrenceEndDate)}T00:00:00Z`)
    : null;
  const metadata = {
    source: 'NIBO',
    generateLocally: false,
    niboRecurrenceId: recurrenceKey,
    niboScheduleId: item.scheduleId,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    supplierName: kind === 'PAYABLE' ? item.stakeholderName : undefined,
  };

  const existing = await prisma.financeRecurrence.findMany({
    where: { organizationId, clinicId, kind },
    select: { id: true, metadata: true, nextOccurrence: true },
    take: 200,
  });
  const match = existing.find((row) => {
    const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
    return String(meta.niboRecurrenceId ?? '').toLowerCase() === recurrenceKey;
  });

  if (match) {
    await prisma.financeRecurrence.update({
      where: { id: match.id },
      data: {
        description: item.description,
        amount: amountString(item.value),
        frequency,
        interval: Math.max(1, item.recurrenceInterval ?? 1),
        nextOccurrence: nextOccurrence > match.nextOccurrence ? nextOccurrence : match.nextOccurrence,
        endsAt,
        active: true,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    return true;
  }

  await prisma.financeRecurrence.create({
    data: {
      organizationId,
      clinicId,
      kind,
      description: item.description,
      amount: amountString(item.value),
      frequency,
      interval: Math.max(1, item.recurrenceInterval ?? 1),
      nextOccurrence,
      endsAt,
      active: true,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
  return true;
}

export { NIBO_PULL_EVENT };

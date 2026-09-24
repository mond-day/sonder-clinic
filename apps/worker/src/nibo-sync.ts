/**
 * Espelho Sonder → Nibo: cria/atualiza schedules credit (Receivable) e debit (Payable).
 */

import { envelopeDecryptJson, envFlagEnabled, integrationMockFallback } from '@sonder/observability';

export type NiboPushEntityType = 'Receivable' | 'Payable';

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

export function isNiboMock(): boolean {
  return envFlagEnabled('NIBO_MOCK', integrationMockFallback());
}

export function decryptNiboCredentials(payload: string): Record<string, string> {
  return envelopeDecryptJson(payload);
}

export function readNiboApiKey(credentials: Record<string, string>): string {
  return pickString(
    credentials.apiKey,
    credentials.ApiToken,
    credentials.apitoken,
    credentials.NIBO_API_TOKEN,
    process.env.NIBO_API_TOKEN,
  );
}

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

export function readNiboReceivableCategoryIds(config: Record<string, unknown> | undefined): string[] {
  return readNiboIdList(config, 'receivableCategoryIds', 'receivableCategoryId');
}

/** Se payableCategoryIds nunca foi gravado, não filtra débito por categoria (evita sumir despesas). */
export function readNiboPayableCategoryIds(config: Record<string, unknown> | undefined): string[] {
  if (!config) return [];
  if (Array.isArray(config.payableCategoryIds) || typeof config.payableCategoryId === 'string') {
    return readNiboIdList(config, 'payableCategoryIds', 'payableCategoryId');
  }
  return [];
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

export function extractNiboId(body: unknown): string | null {
  if (typeof body === 'string' && body.trim()) {
    return body.trim().replace(/^"|"$/g, '') || null;
  }
  const row = asRecord(body);
  if (!row) return null;
  for (const key of ['scheduleId', 'id', 'stakeholderId', 'value']) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstStakeholderFromList(body: unknown): string | null {
  const rows = Array.isArray(body)
    ? body
    : asRecord(body)?.items;
  if (!Array.isArray(rows)) return null;
  for (const entry of rows) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = pickString(row.id, row.stakeholderId);
    if (id) return id;
  }
  return null;
}

export async function findOrCreateNiboCustomer(
  apiKey: string,
  input: { name: string; document?: string | null },
): Promise<string> {
  const document = (input.document ?? '').replace(/\D/g, '');
  if (document) {
    const filter = encodeURIComponent(`document/number eq '${document}'`);
    const listed = await fetchJson(
      niboUrl(`/customers?$filter=${filter}&$top=1&$orderby=name`, apiKey),
      { headers: niboAuthHeaders(apiKey), method: 'GET', signal: AbortSignal.timeout(15_000) },
    );
    if (listed.ok) {
      const found = firstStakeholderFromList(listed.body);
      if (found) return found;
    }
  }

  const payload: Record<string, unknown> = { name: input.name.slice(0, 200) };
  if (document) {
    payload.document = {
      number: document,
      type: document.length > 11 ? 'cnpj' : 'cpf',
    };
  }
  const created = await fetchJson(niboUrl('/customers', apiKey), {
    method: 'POST',
    headers: niboAuthHeaders(apiKey),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const id = extractNiboId(created.body);
  if (!created.ok || !id) {
    throw new Error(`Nibo criar cliente falhou (HTTP ${created.status}).`);
  }
  return id;
}

export async function findOrCreateNiboSupplier(
  apiKey: string,
  input: { name: string },
): Promise<string> {
  const name = input.name.trim() || 'Fornecedor Sonder';
  const filter = encodeURIComponent(`name eq '${name.replace(/'/g, "''")}'`);
  const listed = await fetchJson(
    niboUrl(`/suppliers?$filter=${filter}&$top=1&$orderby=name`, apiKey),
    { headers: niboAuthHeaders(apiKey), method: 'GET', signal: AbortSignal.timeout(15_000) },
  );
  if (listed.ok) {
    const found = firstStakeholderFromList(listed.body);
    if (found) return found;
  }

  const created = await fetchJson(niboUrl('/suppliers', apiKey), {
    method: 'POST',
    headers: niboAuthHeaders(apiKey),
    body: JSON.stringify({ name: name.slice(0, 200) }),
    signal: AbortSignal.timeout(15_000),
  });
  const id = extractNiboId(created.body);
  if (!created.ok || !id) {
    throw new Error(`Nibo criar fornecedor falhou (HTTP ${created.status}).`);
  }
  return id;
}

export async function upsertNiboSchedule(input: {
  apiKey: string;
  kind: 'credit' | 'debit';
  scheduleId?: string | null;
  payload: Record<string, unknown>;
}): Promise<string> {
  const path = input.kind === 'credit' ? '/schedules/credit' : '/schedules/debit';
  const url = input.scheduleId
    ? niboUrl(`${path}/${encodeURIComponent(input.scheduleId)}`, input.apiKey)
    : niboUrl(path, input.apiKey);
  const result = await fetchJson(url, {
    method: input.scheduleId ? 'PUT' : 'POST',
    headers: niboAuthHeaders(input.apiKey),
    body: JSON.stringify(input.payload),
    signal: AbortSignal.timeout(20_000),
  });
  const id = extractNiboId(result.body) ?? input.scheduleId ?? null;
  if (!result.ok || !id) {
    throw new Error(
      `Nibo ${input.scheduleId ? 'atualizar' : 'criar'} schedule ${input.kind} falhou (HTTP ${result.status}).`,
    );
  }
  return id;
}

/** Exclui schedule no Nibo. 404/204 tratados como sucesso (idempotente). */
export async function deleteNiboSchedule(input: {
  apiKey: string;
  kind: 'credit' | 'debit';
  scheduleId: string;
}): Promise<void> {
  const path = input.kind === 'credit' ? '/schedules/credit' : '/schedules/debit';
  const result = await fetchJson(
    niboUrl(`${path}/${encodeURIComponent(input.scheduleId)}`, input.apiKey),
    {
      method: 'DELETE',
      headers: niboAuthHeaders(input.apiKey),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!result.ok && result.status !== 404) {
    throw new Error(`Nibo excluir schedule ${input.kind} falhou (HTTP ${result.status}).`);
  }
}

/**
 * Baixa no Nibo: credit → /receipts; debit → /payments.
 * Exige accountId da conta bancária Nibo.
 */
export async function payNiboSchedule(input: {
  apiKey: string;
  kind: 'credit' | 'debit';
  scheduleId: string;
  accountId: string;
  date: string;
  value: number;
  identifier?: string;
}): Promise<string | null> {
  const suffix = input.kind === 'credit' ? 'receipts' : 'payments';
  const path = input.kind === 'credit' ? '/schedules/credit' : '/schedules/debit';
  const result = await fetchJson(
    niboUrl(`${path}/${encodeURIComponent(input.scheduleId)}/${suffix}`, input.apiKey),
    {
      method: 'POST',
      headers: niboAuthHeaders(input.apiKey),
      body: JSON.stringify({
        accountId: input.accountId,
        date: input.date,
        value: input.value,
        ...(input.identifier ? { identifier: input.identifier.slice(0, 200) } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!result.ok) {
    throw new Error(`Nibo baixa schedule ${input.kind} falhou (HTTP ${result.status}).`);
  }
  return extractNiboId(result.body);
}

export function readNiboAccountId(config: Record<string, unknown> | undefined): string | null {
  if (!config) return null;
  const id = pickString(config.accountId, config.defaultAccountId, config.niboAccountId);
  return id || null;
}

export function buildCreditPayload(input: {
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

export function buildDebitPayload(input: {
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

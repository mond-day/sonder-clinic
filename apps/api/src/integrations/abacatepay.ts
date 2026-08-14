import { asRecord, envFlag, fetchJson, httpErrorDetail, pickString, type AdapterResult } from './http';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type AbacatePayConfig = {
  apiKey: string;
  baseUrl: string;
};

export type AbacatePayMethod = 'PIX' | 'BOLETO';

export type AbacatePayCustomer = {
  name: string;
  taxId: string;
  email?: string;
  cellphone?: string;
};

export type AbacatePayCharge = {
  id: string;
  amount: number;
  status: string;
  method: AbacatePayMethod;
  brCode?: string;
  brCodeBase64?: string;
  barCode?: string;
  url?: string;
  expiresAt?: string;
  receiptUrl?: string | null;
  devMode?: boolean;
};

const DEFAULT_BASE_URL = 'https://api.abacatepay.com/v2';

export function isAbacatePayMock() {
  return envFlag('ABACATEPAY_MOCK', 'true');
}

export function resolveAbacatePayConfig(
  credentials?: Record<string, string>,
  configuration?: unknown,
): AbacatePayConfig | null {
  const creds = credentials ?? {};
  const settings = asRecord(configuration) ?? {};
  const apiKey = pickString(
    process.env.ABACATEPAY_API_KEY,
    creds.apiKey,
    creds.ABACATEPAY_API_KEY,
    creds.token,
    settings.apiKey,
  );
  const baseUrl = pickString(
    process.env.ABACATEPAY_BASE_URL,
    creds.baseUrl,
    creds.ABACATEPAY_BASE_URL,
    settings.baseUrl,
    settings.ABACATEPAY_BASE_URL,
    DEFAULT_BASE_URL,
  ).replace(/\/+$/, '');
  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl || DEFAULT_BASE_URL };
}

function headers(config: AbacatePayConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
    Accept: 'application/json',
  };
}

function readData(body: unknown): Record<string, unknown> | null {
  const row = asRecord(body);
  if (!row) return null;
  if (typeof row.error === 'string' && row.error.trim()) return null;
  if (row.success === false) return null;
  return asRecord(row.data) ?? (pickString(row.id) ? row : null);
}

function mapCharge(data: Record<string, unknown>, method: AbacatePayMethod): AbacatePayCharge {
  const pix = asRecord(data.pix) ?? data;
  return {
    id: pickString(data.id),
    amount: Number(data.amount ?? 0),
    status: pickString(data.status, 'PENDING') || 'PENDING',
    method,
    brCode: pickString(data.brCode, pix.brCode) || undefined,
    brCodeBase64: pickString(data.brCodeBase64, pix.brCodeBase64) || undefined,
    barCode: pickString(data.barCode, data.barcode) || undefined,
    url: pickString(data.url) || undefined,
    expiresAt: pickString(data.expiresAt) || undefined,
    receiptUrl: pickString(data.receiptUrl) || null,
    devMode: data.devMode === true,
  };
}

async function abacateJson(config: AbacatePayConfig, path: string, init?: RequestInit) {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  return fetchJson(url, {
    ...init,
    headers: { ...headers(config), ...(init?.headers as Record<string, string> | undefined) },
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
}

export async function testAbacatePay(config?: AbacatePayConfig | null): Promise<AdapterResult> {
  const resolved = config ?? resolveAbacatePayConfig();
  if (isAbacatePayMock() || !resolved) {
    return {
      success: false,
      provider: 'ABACATEPAY',
      enabled: false,
      message: isAbacatePayMock()
        ? 'AbacatePay desabilitado (ABACATEPAY_MOCK=true).'
        : 'AbacatePay desabilitado: configure ABACATEPAY_API_KEY.',
    };
  }
  try {
    const result = await abacateJson(resolved, '/store/get');
    const data = readData(result.body);
    const ok = result.ok && Boolean(data);
    return {
      success: ok,
      provider: 'ABACATEPAY',
      enabled: true,
      message: ok
        ? `Conexão AbacatePay confirmada${data?.name ? ` (${pickString(data.name)})` : ''}.`
        : `Falha AbacatePay HTTP ${result.status}: ${httpErrorDetail(result.body, 'sem detalhes')}.`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'ABACATEPAY',
      enabled: true,
      message: `Erro ao contatar AbacatePay: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

export async function createAbacatePayCharge(
  config: AbacatePayConfig,
  input: {
    method: AbacatePayMethod;
    amountCents: number;
    description?: string;
    externalId?: string;
    expiresIn?: number;
    dueDate?: string;
    customer?: AbacatePayCustomer;
    metadata?: Record<string, unknown>;
  },
): Promise<AbacatePayCharge> {
  if (input.amountCents < 1) {
    throw new Error('Valor da cobrança AbacatePay deve ser maior que zero.');
  }
  if (input.method === 'BOLETO') {
    if (!input.customer?.name?.trim() || !input.customer.taxId?.trim()) {
      throw new Error('Boleto AbacatePay exige nome e CPF/CNPJ do pagador.');
    }
  }
  const data: Record<string, unknown> = {
    amount: input.amountCents,
    description: input.description?.slice(0, 500),
    metadata: input.metadata,
  };
  if (input.externalId) data.externalId = input.externalId;
  if (input.method === 'PIX') {
    data.expiresIn = input.expiresIn ?? 86_400;
  } else if (input.dueDate) {
    data.dueDate = input.dueDate;
  }
  if (input.customer) {
    if (input.method === 'BOLETO') {
      data.customer = { name: input.customer.name, taxId: input.customer.taxId };
    } else if (input.customer.email && input.customer.cellphone) {
      data.customer = {
        name: input.customer.name,
        taxId: input.customer.taxId,
        email: input.customer.email,
        cellphone: input.customer.cellphone,
      };
    }
  }
  const result = await abacateJson(config, '/transparents/create', {
    method: 'POST',
    body: JSON.stringify({ method: input.method, data }),
  });
  const payload = readData(result.body);
  if (!result.ok || !payload || !pickString(payload.id)) {
    throw new Error(
      `AbacatePay não criou a cobrança: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`,
    );
  }
  return mapCharge(payload, input.method);
}

export async function checkAbacatePayCharge(
  config: AbacatePayConfig,
  chargeId: string,
): Promise<{ id: string; status: string; expiresAt?: string }> {
  const result = await abacateJson(config, `/transparents/check?id=${encodeURIComponent(chargeId)}`);
  const payload = readData(result.body);
  if (!result.ok || !payload) {
    throw new Error(
      `AbacatePay não consultou a cobrança: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`,
    );
  }
  return {
    id: pickString(payload.id, chargeId),
    status: pickString(payload.status, 'PENDING') || 'PENDING',
    expiresAt: pickString(payload.expiresAt) || undefined,
  };
}

export function mapAbacatePayStatus(status: string): 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' {
  const normalized = status.toUpperCase();
  if (normalized === 'PAID' || normalized === 'APPROVED' || normalized === 'REDEEMED' || normalized === 'COMPLETED') {
    return 'CONFIRMED';
  }
  if (normalized === 'EXPIRED' || normalized === 'FAILED') return 'FAILED';
  if (normalized === 'CANCELLED' || normalized === 'REFUNDED') return 'CANCELLED';
  return 'PENDING';
}

/** Chave pública documentada pela AbacatePay para HMAC de webhooks (SHA-256 / Base64). */
export const ABACATEPAY_WEBHOOK_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

export function verifyAbacatePaySignature(rawBody: Buffer | string, signatureFromHeader?: string | string[]) {
  const header = Array.isArray(signatureFromHeader) ? signatureFromHeader[0] : signatureFromHeader;
  if (!header?.trim()) return false;
  const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const expected = createHmac('sha256', ABACATEPAY_WEBHOOK_PUBLIC_KEY).update(bodyBuffer).digest('base64');
  const left = Buffer.from(expected);
  const right = Buffer.from(header.trim());
  return left.length === right.length && timingSafeEqual(left, right);
}

export function timingSafeSecretEqual(stored?: string | null, provided?: string | null) {
  if (!stored?.trim() || !provided?.trim()) return false;
  const left = Buffer.from(stored.trim());
  const right = Buffer.from(provided.trim());
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAbacatePayPaidEvent(event?: string | null, status?: string | null) {
  const ev = String(event ?? '').toLowerCase();
  if (ev === 'transparent.completed' || ev === 'checkout.completed') return true;
  return mapAbacatePayStatus(String(status ?? '')) === 'CONFIRMED';
}

export function readAbacatePayWebhookChargeId(payload: unknown): string {
  const row = asRecord(payload) ?? {};
  const data = asRecord(row.data) ?? row;
  return pickString(data.id, data.chargeId, data.transparentId, row.externalId);
}

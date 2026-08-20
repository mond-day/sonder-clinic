import { createHash, randomBytes } from 'node:crypto';
import { envelopeDecrypt, envelopeEncrypt } from '@sonder/observability';

export const API_KEY_SCOPES = [
  'appointments:read',
  'appointments:write',
  'patients:read',
  'patients:write',
  'catalog:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'appointments:read': 'Ler agendamentos e conflitos',
  'appointments:write': 'Criar, remarcar e cancelar agendamentos',
  'patients:read': 'Buscar e consultar pacientes',
  'patients:write': 'Cadastrar pacientes',
  'catalog:read': 'Listar clínicas, profissionais, unidades e cadeiras',
};

export const API_KEY_RATE_LIMIT = { max: 120, windowMs: 60_000 } as const;
export const API_KEY_MAX_PER_ORGANIZATION = 20;

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function apiKeyKindPrefix(env = process.env.NODE_ENV): 'sk_live_' | 'sk_test_' {
  return (env ?? '').toLowerCase() === 'production' ? 'sk_live_' : 'sk_test_';
}

export function generateApiKey(env = process.env.NODE_ENV): {
  plaintext: string;
  keyPrefix: string;
  keyLastFour: string;
  keyHash: string;
} {
  const kind = apiKeyKindPrefix(env);
  const plaintext = `${kind}${randomBytes(32).toString('base64url')}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, kind.length + 4),
    keyLastFour: plaintext.slice(-4),
    keyHash: hashApiKey(plaintext),
  };
}

export function maskApiKey(keyPrefix: string, keyLastFour: string): string {
  return `${keyPrefix}…${keyLastFour}`;
}

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value);
}

export function normalizeApiKeyScopes(scopes: string[]): ApiKeyScope[] {
  const unique = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
  const invalid = unique.filter((scope) => !isApiKeyScope(scope));
  if (invalid.length) {
    throw new Error(`Escopos inválidos: ${invalid.join(', ')}.`);
  }
  if (!unique.length) {
    throw new Error('Informe ao menos um escopo.');
  }
  return unique as ApiKeyScope[];
}

export function encryptApiKeySecret(plaintext: string, masterKey = process.env.ENCRYPTION_MASTER_KEY): string {
  return envelopeEncrypt(plaintext, masterKey);
}

export function decryptApiKeySecret(payload: string, masterKey = process.env.ENCRYPTION_MASTER_KEY): string {
  return envelopeDecrypt(payload, masterKey).toString('utf8');
}

export function extractApiKeyHeader(headers: {
  'x-api-key'?: string | string[];
  authorization?: string;
}): string | undefined {
  const raw = headers['x-api-key'];
  const fromHeader = Array.isArray(raw) ? raw[0] : raw;
  if (fromHeader?.trim()) return fromHeader.trim();
  return undefined;
}

/** Chave Redis/memória para throttle da Public API (~120/min por apiKeyId). */
export function apiKeyRateLimitKey(apiKeyId: string): string {
  return `api-key:${apiKeyId}`;
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

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
  const key = readMasterKey(masterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptApiKeySecret(payload: string, masterKey = process.env.ENCRYPTION_MASTER_KEY): string {
  const key = readMasterKey(masterKey);
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Segredo criptografado inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function readMasterKey(value?: string): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('ENCRYPTION_MASTER_KEY inválida.');
  }
  return Buffer.from(value, 'hex');
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

export class SlidingWindowThrottle {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number = API_KEY_RATE_LIMIT.max,
    private readonly windowMs: number = API_KEY_RATE_LIMIT.windowMs,
  ) {}

  consume(id: string, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    if (this.hits.size > 10_000) {
      for (const [key, slot] of this.hits) {
        if (now >= slot.resetAt) this.hits.delete(key);
      }
    }
    const current = this.hits.get(id);
    if (!current || now >= current.resetAt) {
      const resetAt = now + this.windowMs;
      this.hits.set(id, { count: 1, resetAt });
      return { allowed: true, remaining: this.max - 1, resetAt };
    }
    if (current.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: current.resetAt };
    }
    current.count += 1;
    return { allowed: true, remaining: this.max - current.count, resetAt: current.resetAt };
  }
}

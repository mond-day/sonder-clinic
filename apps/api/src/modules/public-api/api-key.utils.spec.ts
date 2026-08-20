import { afterEach, describe, expect, it } from 'vitest';
import { clearMemoryRateLimits, consumeRateLimit, RATE_LIMITS } from '../../common/rate-limit';
import {
  apiKeyKindPrefix,
  apiKeyRateLimitKey,
  decryptApiKeySecret,
  encryptApiKeySecret,
  extractApiKeyHeader,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  normalizeApiKeyScopes,
  API_KEY_RATE_LIMIT,
} from './api-key.utils';

describe('api-key.utils', () => {
  afterEach(() => {
    clearMemoryRateLimits();
  });

  it('gera chaves com prefixo de ambiente e hash irreversível', () => {
    const live = generateApiKey('production');
    const test = generateApiKey('development');
    expect(live.plaintext.startsWith('sk_live_')).toBe(true);
    expect(test.plaintext.startsWith('sk_test_')).toBe(true);
    expect(live.keyHash).toBe(hashApiKey(live.plaintext));
    expect(live.keyHash).not.toBe(live.plaintext);
    expect(live.keyLastFour).toBe(live.plaintext.slice(-4));
    expect(maskApiKey(live.keyPrefix, live.keyLastFour)).toContain('…');
    expect(maskApiKey(live.keyPrefix, live.keyLastFour)).not.toContain(live.plaintext.slice(12, 24));
  });

  it('usa sk_test_ fora de produção', () => {
    expect(apiKeyKindPrefix('development')).toBe('sk_test_');
    expect(apiKeyKindPrefix('production')).toBe('sk_live_');
  });

  it('normaliza escopos e rejeita inválidos ou vazios', () => {
    expect(normalizeApiKeyScopes(['appointments:read', 'appointments:read', 'patients:write'])).toEqual([
      'appointments:read',
      'patients:write',
    ]);
    expect(() => normalizeApiKeyScopes(['appointments:read', 'admin'])).toThrow(/Escopos inválidos/);
    expect(() => normalizeApiKeyScopes([])).toThrow(/ao menos um escopo/);
  });

  it('lê apenas o header X-API-Key', () => {
    expect(extractApiKeyHeader({ 'x-api-key': ' sk_test_abc ' })).toBe('sk_test_abc');
    expect(extractApiKeyHeader({ authorization: 'Bearer sk_test_abc' })).toBeUndefined();
    expect(extractApiKeyHeader({})).toBeUndefined();
  });

  it('cifra e decifra o segredo com ENCRYPTION_MASTER_KEY (envelope v2)', () => {
    const master = '11'.repeat(32);
    const generated = generateApiKey('development');
    const payload = encryptApiKeySecret(generated.plaintext, master);
    expect(payload).not.toContain(generated.plaintext);
    expect(payload.startsWith('v2.')).toBe(true);
    expect(decryptApiKeySecret(payload, master)).toBe(generated.plaintext);
  });

  it('decifra segredo legado v1', () => {
    const { createCipheriv, randomBytes } = require('node:crypto') as typeof import('node:crypto');
    const master = '11'.repeat(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(master, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update('sk_test_legacy', 'utf8'), cipher.final()]);
    const v1 = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
    expect(decryptApiKeySecret(v1, master)).toBe('sk_test_legacy');
  });

  it('rejeita chave mestra inválida', () => {
    expect(() => encryptApiKeySecret('sk_test_abc', 'short')).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('rate limit por chave via helper Redis/memória (~120/min)', async () => {
    expect(API_KEY_RATE_LIMIT).toEqual(RATE_LIMITS.apiKey);
    const key = apiKeyRateLimitKey('key-test');
    const { max, windowMs } = RATE_LIMITS.apiKey;
    for (let i = 0; i < max; i += 1) {
      expect(await consumeRateLimit(key, max, windowMs, 1_000 + i)).toBe(true);
    }
    expect(await consumeRateLimit(key, max, windowMs, 1_000 + max)).toBe(false);
    expect(await consumeRateLimit(key, max, windowMs, 1_000 + windowMs)).toBe(true);
  });
});

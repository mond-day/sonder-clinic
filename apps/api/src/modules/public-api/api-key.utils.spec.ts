import { describe, expect, it } from 'vitest';
import {
  apiKeyKindPrefix,
  decryptApiKeySecret,
  encryptApiKeySecret,
  extractApiKeyHeader,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  normalizeApiKeyScopes,
  SlidingWindowThrottle,
} from './api-key.utils';

describe('api-key.utils', () => {
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

  it('cifra e decifra o segredo com ENCRYPTION_MASTER_KEY', () => {
    const master = '11'.repeat(32);
    const generated = generateApiKey('development');
    const payload = encryptApiKeySecret(generated.plaintext, master);
    expect(payload).not.toContain(generated.plaintext);
    expect(payload.split('.').length).toBe(3);
    expect(decryptApiKeySecret(payload, master)).toBe(generated.plaintext);
  });

  it('rejeita chave mestra inválida', () => {
    expect(() => encryptApiKeySecret('sk_test_abc', 'short')).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('aplica janela deslizante de rate limit', () => {
    const throttle = new SlidingWindowThrottle(2, 1_000);
    const first = throttle.consume('k1', 0);
    const second = throttle.consume('k1', 10);
    const third = throttle.consume('k1', 20);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(throttle.consume('k1', 1_000).allowed).toBe(true);
  });
});

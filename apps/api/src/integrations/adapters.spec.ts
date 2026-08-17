import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAbacatePayStatus, resolveAbacatePayConfig } from './abacatepay';
import { resolveChatwootConfig, toChatwootPhone } from './chatwoot';
import { niboAuthHeaders, niboUrl, testNibo, testProvider } from './adapters';

describe('Chatwoot config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolveChatwootConfig exige baseUrl, token e accountId', () => {
    expect(resolveChatwootConfig({ apiToken: 't' }, { baseUrl: 'https://cw.local' })).toBeNull();
    expect(resolveChatwootConfig(
      { apiToken: 't' },
      { baseUrl: 'https://cw.local/', accountId: '12', inboxId: '3' },
    )).toEqual({
      baseUrl: 'https://cw.local',
      token: 't',
      accountId: '12',
      inboxId: '3',
    });
  });

  it('toChatwootPhone normaliza DDD brasileiro para E.164', () => {
    expect(toChatwootPhone('65999998888')).toBe('+5565999998888');
    expect(toChatwootPhone('+55 65 99999-8888')).toBe('+5565999998888');
  });
});

describe('AbacatePay config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('usa API key da conexão e base URL padrão v2', () => {
    expect(resolveAbacatePayConfig({ apiKey: 'abc_live' })).toEqual({
      apiKey: 'abc_live',
      baseUrl: 'https://api.abacatepay.com/v2',
    });
  });

  it('mapAbacatePayStatus não confirma sem pagamento', () => {
    expect(mapAbacatePayStatus('PENDING')).toBe('PENDING');
    expect(mapAbacatePayStatus('PAID')).toBe('CONFIRMED');
    expect(mapAbacatePayStatus('COMPLETED')).toBe('CONFIRMED');
    expect(mapAbacatePayStatus('EXPIRED')).toBe('FAILED');
    expect(mapAbacatePayStatus('CANCELLED')).toBe('CANCELLED');
  });
});

describe('testProvider mock honesto', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('Chatwoot, AbacatePay e Nibo não fingem sucesso em MOCK', async () => {
    vi.stubEnv('CHATWOOT_MOCK', 'true');
    vi.stubEnv('ABACATEPAY_MOCK', 'true');
    vi.stubEnv('NIBO_MOCK', 'true');
    await expect(testProvider('CHATWOOT')).resolves.toMatchObject({ success: false, enabled: false });
    await expect(testProvider('ABACATEPAY')).resolves.toMatchObject({ success: false, enabled: false });
    await expect(testProvider('NIBO')).resolves.toMatchObject({ success: false, enabled: false });
    await expect(testNibo()).resolves.toMatchObject({ success: false, enabled: false });
  });

  it('com NIBO_MOCK=true e apiKey da conexão não retorna mensagem de MOCK', async () => {
    vi.stubEnv('NIBO_MOCK', 'true');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await testNibo('clinic-api-key');
    expect(result.message).not.toMatch(/MOCK/i);
    expect(result.enabled).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/categories');
    expect(url).toContain('apitoken=clinic-api-key');
    expect(init.headers).toMatchObject({ ApiToken: 'clinic-api-key' });
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});

describe('Nibo auth', () => {
  it('usa ApiToken e query, nunca Authorization', () => {
    expect(niboAuthHeaders('abc')).toEqual({ ApiToken: 'abc', Accept: 'application/json' });
    expect(niboUrl('https://api.nibo.com.br/empresas/v1', '/categories', 'abc')).toBe(
      'https://api.nibo.com.br/empresas/v1/categories?apitoken=abc',
    );
  });
});

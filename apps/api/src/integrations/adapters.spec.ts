import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAbacatePayStatus, resolveAbacatePayConfig } from './abacatepay';
import { resolveChatwootConfig, toChatwootPhone } from './chatwoot';
import { testProvider } from './adapters';

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
  afterEach(() => vi.unstubAllEnvs());

  it('Chatwoot, AbacatePay e Nibo não fingem sucesso em MOCK', async () => {
    vi.stubEnv('CHATWOOT_MOCK', 'true');
    vi.stubEnv('ABACATEPAY_MOCK', 'true');
    vi.stubEnv('NIBO_MOCK', 'true');
    await expect(testProvider('CHATWOOT')).resolves.toMatchObject({ success: false, enabled: false });
    await expect(testProvider('ABACATEPAY')).resolves.toMatchObject({ success: false, enabled: false });
    await expect(testProvider('NIBO')).resolves.toMatchObject({ success: false, enabled: false });
  });
});

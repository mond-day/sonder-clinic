import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEvolutionConfiguration, sendEvolutionText } from './evolution';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Evolution adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('exige URL, chave e instância antes de enviar', () => {
    expect(
      readEvolutionConfiguration(
        { EVOLUTION_API_KEY: 'secret', EVOLUTION_BASE_URL: 'https://evolution.local' },
        {},
      ),
    ).toBeNull();
  });

  it('aceita fallback de process.env.EVOLUTION_*', () => {
    vi.stubEnv('EVOLUTION_BASE_URL', 'https://env-evo');
    vi.stubEnv('EVOLUTION_API_KEY', 'env-secret');
    vi.stubEnv('EVOLUTION_INSTANCE', 'env-instance');
    expect(readEvolutionConfiguration({}, {})).toEqual({
      baseUrl: 'https://env-evo',
      apiKey: 'env-secret',
      instance: 'env-instance',
      delayMs: 1500,
      minIntervalMs: 4000,
    });
  });

  it('envia texto pelo endpoint v2 com delay e sem expor a chave no corpo', async () => {
    vi.stubEnv('EVOLUTION_MIN_INTERVAL_MS', '0');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEvolutionText(
      {
        baseUrl: 'https://evolution.local/',
        apiKey: 'secret',
        instance: 'sonder clinic',
        delayMs: 1500,
        minIntervalMs: 0,
      },
      '5565999999999',
      'Lembrete',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.local/message/sendText/sonder%20clinic',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'secret' }),
        body: JSON.stringify({ number: '5565999999999', text: 'Lembrete', delay: 1500 }),
      }),
    );
  });
});

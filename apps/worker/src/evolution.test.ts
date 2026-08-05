import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEvolutionConfiguration, sendEvolutionText } from './evolution';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Evolution adapter', () => {
  it('exige URL, chave e instância antes de enviar', () => {
    expect(
      readEvolutionConfiguration(
        { EVOLUTION_API_KEY: 'secret', EVOLUTION_BASE_URL: 'https://evolution.local' },
        {},
      ),
    ).toBeNull();
  });

  it('envia texto pelo endpoint v2 sem expor a chave no corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEvolutionText(
      {
        baseUrl: 'https://evolution.local/',
        apiKey: 'secret',
        instance: 'sonder clinic',
      },
      '5565999999999',
      'Lembrete',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.local/message/sendText/sonder%20clinic',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'secret' }),
        body: JSON.stringify({ number: '5565999999999', text: 'Lembrete' }),
      }),
    );
  });
});

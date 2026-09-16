import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, clearCsrfTokenCache } from './api';

describe('api CSRF cache', () => {
  afterEach(() => {
    clearCsrfTokenCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reusa X-CSRF-Token do header de resposta em mutações seguintes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ required: false }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'token-from-api',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { cookie: '' });

    await api.get('/setup/status');
    await api.post('/integrations/1/credentials', { apiKey: 'x' });

    const mutatingCall = fetchMock.mock.calls[1]!;
    const headers = mutatingCall[1]?.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('token-from-api');
  });
});

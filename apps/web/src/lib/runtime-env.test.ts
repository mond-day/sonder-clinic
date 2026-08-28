import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicEnv, runtimeEnvScript } from './runtime-env';

const KEY = 'NEXT_PUBLIC_API_URL' as const;

describe('getPublicEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it('no client usa window.__ENV__', () => {
    vi.stubGlobal('window', { __ENV__: { NEXT_PUBLIC_API_URL: 'https://api.runtime/api/v1' } });
    expect(getPublicEnv(KEY)).toBe('https://api.runtime/api/v1');
  });

  it('no client sem __ENV__ retorna undefined e não lê process.env', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://from-process/api/v1';
    vi.stubGlobal('window', {});
    expect(getPublicEnv(KEY)).toBeUndefined();
  });

  it('no server sem env retorna undefined', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(typeof window).toBe('undefined');
    expect(getPublicEnv(KEY)).toBeUndefined();
  });

  it('no server usa process.env', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://from-server/api/v1';
    expect(typeof window).toBe('undefined');
    expect(getPublicEnv(KEY)).toBe('https://from-server/api/v1');
  });
});

describe('runtimeEnvScript', () => {
  it('serializa JSON e escapa < para não quebrar </script>', () => {
    const html = runtimeEnvScript({ NEXT_PUBLIC_API_URL: 'https://x.com/<script>' });
    expect(html.startsWith('window.__ENV__=')).toBe(true);
    expect(html).toContain('\\u003c');
    expect(html).not.toMatch(/<\/script>/i);
  });
});

import { describe, expect, it } from 'vitest';
import { resolvePublicWebUrl } from './public-web-url';

describe('resolvePublicWebUrl', () => {
  it('usa localhost só fora de produção', () => {
    expect(resolvePublicWebUrl({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('http://localhost:3000');
    expect(resolvePublicWebUrl({
      NODE_ENV: 'development',
      WEB_URL: 'http://localhost:3000/',
    } as NodeJS.ProcessEnv)).toBe('http://localhost:3000');
  });

  it('recusa ausência, localhost e http em produção', () => {
    expect(() => resolvePublicWebUrl({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/obrigatório/);
    expect(() => resolvePublicWebUrl({
      NODE_ENV: 'production',
      WEB_URL: 'http://localhost:3000',
    } as NodeJS.ProcessEnv)).toThrow(/localhost/);
    expect(() => resolvePublicWebUrl({
      NODE_ENV: 'production',
      WEB_URL: 'http://app.sonder.clinic',
    } as NodeJS.ProcessEnv)).toThrow(/HTTPS/);
  });

  it('aceita HTTPS público em produção', () => {
    expect(resolvePublicWebUrl({
      NODE_ENV: 'production',
      WEB_URL: 'https://app.sonder.clinic/',
    } as NodeJS.ProcessEnv)).toBe('https://app.sonder.clinic');
  });
});

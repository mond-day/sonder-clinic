import { describe, expect, it } from 'vitest';
import { assertProductionEnvironment, isSwaggerEnabled } from './production-env';

describe('production-env', () => {
  it('não valida fora de production', () => {
    expect(() => assertProductionEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('recusa secrets default em production', () => {
    expect(() => assertProductionEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'change-me-access-dev-only-min-32-chars!!',
      JWT_REFRESH_SECRET: 'change-me-refresh-dev-only-min-32-chars!',
      ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      COOKIE_SECURE: 'false',
      DATABASE_URL: 'postgresql://sonder:senha123@localhost:5432/sonder_clinic',
      QUEUE_DRIVER: 'memory',
      STORAGE_DRIVER: 'local',
    } as NodeJS.ProcessEnv)).toThrow(/Ambiente de produção inválido/);
  });

  it('aceita ambiente de produção válido e recusa WEB_URL localhost', () => {
    const valid = {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      COOKIE_SECURE: 'true',
      DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
      QUEUE_DRIVER: 'redis',
      REDIS_URL: 'redis://redis.internal:6379',
      STORAGE_DRIVER: 's3',
      CORS_ORIGIN: 'https://app.example.com',
      WEB_URL: 'https://app.example.com',
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionEnvironment(valid)).not.toThrow();
    expect(() => assertProductionEnvironment({
      ...valid,
      WEB_URL: 'http://localhost:3000',
    })).toThrow(/WEB_URL/);
  });

  it('swagger default off em production', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

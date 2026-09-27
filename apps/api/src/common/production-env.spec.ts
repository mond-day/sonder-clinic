import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertProductionEnvironment, isSwaggerEnabled } from './production-env';

function exampleMasterKey(): string {
  const example = readFileSync(resolve(__dirname, '../../../../.env.example'), 'utf8');
  const match = /^ENCRYPTION_MASTER_KEY=(\S+)$/m.exec(example);
  if (!match?.[1]) throw new Error('ENCRYPTION_MASTER_KEY ausente no .env.example');
  return match[1];
}

const VALID_PRODUCTION_ENV = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  COOKIE_SECURE: 'true',
  DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
  QUEUE_DRIVER: 'redis',
  REDIS_URL: 'redis://redis.internal:6379',
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://minio.internal',
  S3_BUCKET: 'sonder-clinic',
  S3_ACCESS_KEY: 'minio-key',
  S3_SECRET_KEY: 'minio-secret',
  CORS_ORIGIN: 'https://app.example.com',
  WEB_URL: 'https://app.example.com',
} as NodeJS.ProcessEnv;

describe('production-env', () => {
  it('recusa somente a ENCRYPTION_MASTER_KEY do .env.example num ambiente de produção válido', () => {
    expect(() => assertProductionEnvironment(VALID_PRODUCTION_ENV)).not.toThrow();

    const key = exampleMasterKey();
    for (const variant of [key, key.toUpperCase(), `  ${key}  `]) {
      let message = '';
      try {
        assertProductionEnvironment({ ...VALID_PRODUCTION_ENV, ENCRYPTION_MASTER_KEY: variant });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/ENCRYPTION_MASTER_KEY .*default do \.env\.example/);
      expect(message.split('\n- ')).toHaveLength(2);
    }
  });

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
      S3_ENDPOINT: 'https://minio.internal',
      S3_BUCKET: 'sonder-clinic',
      S3_ACCESS_KEY: 'minio-key',
      S3_SECRET_KEY: 'minio-secret',
      CORS_ORIGIN: 'https://app.example.com',
      WEB_URL: 'https://app.example.com',
      GOOGLE_CALENDAR_MOCK: 'false',
      NIBO_MOCK: 'false',
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionEnvironment(valid)).not.toThrow();
    expect(() => assertProductionEnvironment({
      ...valid,
      WEB_URL: 'http://localhost:3000',
    })).toThrow(/WEB_URL/);
  });

  it('aceita MOCK ausente em production e recusa MOCK=true', () => {
    const base = {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      COOKIE_SECURE: 'true',
      DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
      QUEUE_DRIVER: 'redis',
      REDIS_URL: 'redis://redis.internal:6379',
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://minio.internal',
      S3_BUCKET: 'sonder-clinic',
      S3_ACCESS_KEY: 'minio-key',
      S3_SECRET_KEY: 'minio-secret',
      CORS_ORIGIN: 'https://app.example.com',
      WEB_URL: 'https://app.example.com',
    } as NodeJS.ProcessEnv;
    expect(() => assertProductionEnvironment(base)).not.toThrow();
    expect(() => assertProductionEnvironment({
      ...base,
      GOOGLE_CALENDAR_MOCK: 'false',
      NIBO_MOCK: 'true',
    })).toThrow(/NIBO_MOCK/);
    expect(() => assertProductionEnvironment({
      ...base,
      GOOGLE_CALENDAR_MOCK: 'true',
      NIBO_MOCK: 'false',
    })).toThrow(/GOOGLE_CALENDAR_MOCK/);
  });

  it('swagger default off em production', () => {
    expect(isSwaggerEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSwaggerEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

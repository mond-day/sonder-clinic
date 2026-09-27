import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertWorkerProductionEnvironment } from './production-env';

function exampleMasterKey(): string {
  const example = readFileSync(resolve(__dirname, '../../../.env.example'), 'utf8');
  const match = /^ENCRYPTION_MASTER_KEY=(\S+)$/m.exec(example);
  if (!match?.[1]) throw new Error('ENCRYPTION_MASTER_KEY ausente no .env.example');
  return match[1];
}

const VALID_WORKER_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
  QUEUE_DRIVER: 'redis',
  REDIS_URL: 'redis://redis.internal:6379',
  STORAGE_DRIVER: 's3',
  ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
} as NodeJS.ProcessEnv;

describe('worker production-env', () => {
  it('recusa somente a ENCRYPTION_MASTER_KEY do .env.example num ambiente de produção válido', () => {
    expect(() => assertWorkerProductionEnvironment(VALID_WORKER_ENV)).not.toThrow();

    const key = exampleMasterKey();
    for (const variant of [key, key.toUpperCase(), `  ${key}  `]) {
      let message = '';
      try {
        assertWorkerProductionEnvironment({ ...VALID_WORKER_ENV, ENCRYPTION_MASTER_KEY: variant });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/ENCRYPTION_MASTER_KEY .*default do \.env\.example/);
      expect(message.split('\n- ')).toHaveLength(2);
    }
  });

  it('não valida fora de production', () => {
    expect(() => assertWorkerProductionEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('recusa worker de produção incompleto', () => {
    expect(() => assertWorkerProductionEnvironment({
      NODE_ENV: 'production',
      QUEUE_DRIVER: 'memory',
      STORAGE_DRIVER: 'local',
    } as NodeJS.ProcessEnv)).toThrow(/Ambiente de produção inválido no worker/);
  });

  it('aceita worker de produção válido', () => {
    expect(() => assertWorkerProductionEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
      QUEUE_DRIVER: 'redis',
      REDIS_URL: 'redis://redis.internal:6379',
      STORAGE_DRIVER: 's3',
      ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      GOOGLE_CALENDAR_MOCK: 'false',
      NIBO_MOCK: 'false',
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('aceita MOCK ausente no worker e recusa MOCK=true', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://app:x@db.internal:5432/sonder_clinic',
      QUEUE_DRIVER: 'redis',
      REDIS_URL: 'redis://redis.internal:6379',
      STORAGE_DRIVER: 's3',
      ENCRYPTION_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    } as NodeJS.ProcessEnv;
    expect(() => assertWorkerProductionEnvironment(base)).not.toThrow();
    expect(() => assertWorkerProductionEnvironment({
      ...base,
      GOOGLE_CALENDAR_MOCK: 'true',
    })).toThrow(/GOOGLE_CALENDAR_MOCK/);
  });
});

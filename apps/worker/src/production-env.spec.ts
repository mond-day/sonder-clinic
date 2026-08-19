import { describe, expect, it } from 'vitest';
import { assertWorkerProductionEnvironment } from './production-env';

describe('worker production-env', () => {
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
    } as NodeJS.ProcessEnv)).not.toThrow();
  });
});

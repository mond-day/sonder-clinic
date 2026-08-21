import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hydrateDockerSecrets, nestLoggerLevels } from './index';

describe('hydrateDockerSecrets', () => {
  const dir = join(tmpdir(), `sonder-secrets-${process.pid}`);

  afterEach(() => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.S3_ACCESS_KEY;
    rmSync(dir, { recursive: true, force: true });
  });

  it('lê arquivos do Swarm só quando o env está vazio', () => {
    // O CI define JWT_ACCESS_SECRET no ambiente do job; o teste precisa do env vazio.
    delete process.env.JWT_ACCESS_SECRET;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'jwt_access_secret'), ' from-file \n');
    writeFileSync(join(dir, 's3_access_key'), 'minio-key');
    process.env.S3_ACCESS_KEY = 'already-set';

    hydrateDockerSecrets(dir);

    expect(process.env.JWT_ACCESS_SECRET).toBe('from-file');
    expect(process.env.S3_ACCESS_KEY).toBe('already-set');
  });
});

describe('nestLoggerLevels', () => {
  it('mapeia LOG_LEVEL para os níveis do Nest', () => {
    expect(nestLoggerLevels('error')).toEqual(['error']);
    expect(nestLoggerLevels('warn')).toEqual(['error', 'warn']);
    expect(nestLoggerLevels('info')).toEqual(['error', 'warn', 'log']);
    expect(nestLoggerLevels('debug')).toEqual(['error', 'warn', 'log', 'debug']);
    expect(nestLoggerLevels('silent')).toEqual([]);
  });
});

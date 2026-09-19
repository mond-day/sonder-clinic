import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hydrateBootstrapSecrets,
  looksLocalHost,
  parseDatabaseUrl,
  redactUrl,
  runBootMigrations,
  sanitizePgIdentifier,
} from './bootstrap';

describe('bootstrap helpers', () => {
  it('sanitiza identificadores PostgreSQL', () => {
    expect(sanitizePgIdentifier('sonder_clinic', 'db')).toBe('sonder_clinic');
    expect(() => sanitizePgIdentifier('sonder-clinic', 'db')).toThrow(/inválido/);
    expect(() => sanitizePgIdentifier('DROP DATABASE', 'db')).toThrow(/inválido/);
    expect(() => sanitizePgIdentifier('sonder_clinic; SELECT 1', 'db')).toThrow(/inválido/);
  });

  it('extrai nome e usuário de DATABASE_URL', () => {
    const parsed = parseDatabaseUrl(
      'postgresql://sonder_app:s3cret@db.internal:5432/sonder_clinic?schema=public',
    );
    expect(parsed.name).toBe('sonder_clinic');
    expect(parsed.user).toBe('sonder_app');
    expect(parsed.host).toBe('db.internal');
    expect(parsed.maintenanceUrl).toContain('/postgres');
    expect(parsed.maintenanceUrl).not.toContain('sonder_clinic');
  });

  it('não inclui senha em URLs redigidas', () => {
    const redacted = redactUrl('postgresql://sonder:super-secret@db.internal:5432/sonder_clinic');
    expect(redacted).not.toContain('super-secret');
    expect(redacted).toContain('***');
  });

  it('detecta hosts locais', () => {
    expect(looksLocalHost('postgresql://sonder:x@localhost:5432/sonder_clinic')).toBe(true);
    expect(looksLocalHost('https://127.0.0.1:3000')).toBe(true);
    expect(looksLocalHost('https://app.sonder.clinic')).toBe(false);
  });

  it('hidrata DATABASE_URL a partir de Docker secrets sem sobrescrever env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonder-bootstrap-secrets-'));
    writeFileSync(join(dir, 'database_url'), 'postgresql://from-secret@db/sonder_clinic\n');
    writeFileSync(join(dir, 'database_admin_url'), 'postgresql://admin@db/postgres\n');

    const empty: NodeJS.ProcessEnv = {};
    hydrateBootstrapSecrets(empty, dir);
    expect(empty.DATABASE_URL).toBe('postgresql://from-secret@db/sonder_clinic');
    expect(empty.DATABASE_ADMIN_URL).toBe('postgresql://admin@db/postgres');

    const preset: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://env@db/sonder_clinic' };
    hydrateBootstrapSecrets(preset, dir);
    expect(preset.DATABASE_URL).toBe('postgresql://env@db/sonder_clinic');
  });

  it('runBootMigrations falha rápido sem DATABASE_URL', async () => {
    await expect(runBootMigrations({ env: {}, service: 'test-boot' })).rejects.toThrow(/DATABASE_URL/);
  });

  it('runBootMigrations hidrata secret database_url antes de conectar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonder-boot-migrate-'));
    writeFileSync(join(dir, 'database_url'), 'postgresql://from_secret@127.0.0.1:1/sonder_clinic\n');
    const env: NodeJS.ProcessEnv = {};
    await expect(
      runBootMigrations({ env, service: 'test-boot', secretsDir: dir, postgresWaitMs: 1_500 }),
    ).rejects.toThrow(/PostgreSQL indisponível/);
    expect(env.DATABASE_URL).toBe('postgresql://from_secret@127.0.0.1:1/sonder_clinic');
  });
});

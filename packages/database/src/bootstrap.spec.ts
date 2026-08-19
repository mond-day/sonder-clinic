import { describe, expect, it } from 'vitest';
import {
  looksLocalHost,
  parseDatabaseUrl,
  redactUrl,
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
});

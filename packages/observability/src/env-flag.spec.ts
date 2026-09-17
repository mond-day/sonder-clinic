import { describe, expect, it } from 'vitest';
import { envFlagEnabled, parseEnvFlag, readEnvFlag } from './env-flag';

describe('parseEnvFlag', () => {
  it('liga só com true/1/yes/y/on (case-insensitive)', () => {
    for (const raw of ['true', 'TRUE', 'True', '1', 'yes', 'YES', 'y', 'on', 'ON']) {
      expect(parseEnvFlag(raw, false)).toEqual({
        value: true,
        present: true,
        raw: raw.toLowerCase(),
      });
    }
  });

  it('desliga com false/0/no/n/off e aspas', () => {
    const cases: Array<{ raw: string; expected: string }> = [
      { raw: 'false', expected: 'false' },
      { raw: 'FALSE', expected: 'false' },
      { raw: '0', expected: '0' },
      { raw: 'no', expected: 'no' },
      { raw: 'n', expected: 'n' },
      { raw: 'off', expected: 'off' },
      { raw: '"false"', expected: 'false' },
      { raw: "'false'", expected: 'false' },
      { raw: ' "false" ', expected: 'false' },
    ];
    for (const { raw, expected } of cases) {
      expect(parseEnvFlag(raw, true)).toEqual({
        value: false,
        present: true,
        raw: expected,
      });
    }
  });

  it('ausente ou vazio usa fallback e present=false', () => {
    expect(parseEnvFlag(undefined, true)).toEqual({ value: true, present: false, raw: null });
    expect(parseEnvFlag(null, false)).toEqual({ value: false, present: false, raw: null });
    expect(parseEnvFlag('', true)).toEqual({ value: true, present: false, raw: null });
    expect(parseEnvFlag('   ', false)).toEqual({ value: false, present: false, raw: null });
    expect(parseEnvFlag('""', true)).toEqual({ value: true, present: false, raw: null });
  });

  it('valor desconhecido usa fallback mas marca present', () => {
    expect(parseEnvFlag('maybe', true)).toEqual({ value: true, present: true, raw: 'maybe' });
    expect(parseEnvFlag('maybe', false)).toEqual({ value: false, present: true, raw: 'maybe' });
  });
});

describe('readEnvFlag / envFlagEnabled', () => {
  it('lê do env e diferencia ausente vs false', () => {
    const env: NodeJS.ProcessEnv = { GOOGLE_CALENDAR_MOCK: 'false' };
    expect(readEnvFlag('GOOGLE_CALENDAR_MOCK', true, env)).toEqual({
      value: false,
      present: true,
      raw: 'false',
    });
    expect(envFlagEnabled('GOOGLE_CALENDAR_MOCK', true, env)).toBe(false);

    const missing: NodeJS.ProcessEnv = {};
    expect(readEnvFlag('GOOGLE_CALENDAR_MOCK', true, missing)).toEqual({
      value: true,
      present: false,
      raw: null,
    });
    expect(envFlagEnabled('NIBO_MOCK', true, { NIBO_MOCK: '0' })).toBe(false);
    expect(envFlagEnabled('NIBO_MOCK', true, { NIBO_MOCK: '1' })).toBe(true);
  });
});

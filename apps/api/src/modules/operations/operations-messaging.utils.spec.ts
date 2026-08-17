import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMessageTemplate, resolveEvolutionConfig } from './operations-messaging.utils';

describe('renderMessageTemplate', () => {
  it('substitutes known variables', () => {
    expect(renderMessageTemplate('Olá {{patientName}} em {{date}}', {
      patientName: 'Ana',
      date: '07/08/2026',
      clinicName: '',
      professionalName: '',
    })).toBe('Olá Ana em 07/08/2026');
  });

  it('keeps unknown placeholders as-is', () => {
    expect(renderMessageTemplate('Oi {{unknown}}', {
      patientName: '',
      date: '',
      clinicName: '',
      professionalName: '',
    })).toBe('Oi {{unknown}}');
  });
});

describe('resolveEvolutionConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('exige baseUrl, apiKey e instance', () => {
    expect(resolveEvolutionConfig({ baseUrl: 'https://evo.local', apiKey: 'k' })).toBeNull();
    expect(
      resolveEvolutionConfig({ baseUrl: 'https://evo.local/', apiKey: 'k', instance: 'clinic' }),
    ).toEqual({
      baseUrl: 'https://evo.local',
      apiKey: 'k',
      instance: 'clinic',
      delayMs: 1500,
      minIntervalMs: 4000,
    });
  });

  it('aceita env EVOLUTION_*', () => {
    vi.stubEnv('EVOLUTION_BASE_URL', 'https://from-env');
    vi.stubEnv('EVOLUTION_API_KEY', 'env-key');
    vi.stubEnv('EVOLUTION_INSTANCE', 'env-instance');
    expect(resolveEvolutionConfig({})).toEqual({
      baseUrl: 'https://from-env',
      apiKey: 'env-key',
      instance: 'env-instance',
      delayMs: 1500,
      minIntervalMs: 4000,
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createChannelSchema,
  formatUnitAddress,
  renderMessageTemplate,
  resolveEvolutionConfig,
  updateChannelSchema,
} from './operations-messaging.utils';

const CONNECTION_ID = '4f9c2d1e-8b7a-4c3d-9e2f-1a2b3c4d5e6f';

describe('createChannelSchema', () => {
  it('exige integração conectada em canal WhatsApp', () => {
    const result = createChannelSchema.safeParse({ type: 'WHATSAPP', displayName: 'WhatsApp recepção' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['integrationConnectionId']);
  });

  it('aceita WhatsApp com integrationConnectionId uuid', () => {
    const result = createChannelSchema.safeParse({
      type: 'WHATSAPP',
      displayName: 'WhatsApp recepção',
      integrationConnectionId: CONNECTION_ID,
    });
    expect(result.success).toBe(true);
  });

  it('e-mail não precisa (nem aceita) integração de terceiros', () => {
    expect(createChannelSchema.safeParse({ type: 'EMAIL', displayName: 'E-mail clínica' }).success).toBe(true);
    expect(
      createChannelSchema.safeParse({
        type: 'EMAIL',
        displayName: 'E-mail clínica',
        integrationConnectionId: CONNECTION_ID,
      }).success,
    ).toBe(false);
  });

  it('rejeita id de integração que não é uuid', () => {
    expect(
      createChannelSchema.safeParse({ type: 'WHATSAPP', displayName: 'Zap', integrationConnectionId: 'abc' }).success,
    ).toBe(false);
    expect(updateChannelSchema.safeParse({ integrationConnectionId: 'abc' }).success).toBe(false);
  });
});

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

  it('substitui endereço da clínica e horário do agendamento', () => {
    expect(renderMessageTemplate('{{appointmentTime}} · {{clinicAddress}}', {
      appointmentTime: '14:30',
      clinicAddress: 'Rua das Flores, 100 · Cuiabá',
    })).toBe('14:30 · Rua das Flores, 100 · Cuiabá');
  });
});

describe('formatUnitAddress', () => {
  it('prefere o endereço cadastrado e cai para nome + cidade', () => {
    expect(formatUnitAddress({ name: 'Centro', address: 'Rua A, 1', city: 'Cuiabá' })).toBe('Rua A, 1 · Cuiabá');
    expect(formatUnitAddress({ name: 'Centro', address: null, city: 'Cuiabá' })).toBe('Centro · Cuiabá');
    expect(formatUnitAddress(null)).toBe('');
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

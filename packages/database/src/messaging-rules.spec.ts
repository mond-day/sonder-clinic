import { describe, expect, it } from 'vitest';
import {
  applyMondaySendDay,
  parseInboundReply,
  phonesMatch,
  readMessageSchedule,
  renderMessageTemplateText,
} from './messaging-rules.ts';

const TZ = 'America/Cuiaba'; // UTC-4, sem horário de verão

describe('renderMessageTemplateText', () => {
  it('substitui endereço e horário e preserva tokens desconhecidos', () => {
    expect(
      renderMessageTemplateText('{{patientName}} às {{appointmentTime}} em {{clinicAddress}} {{foo}}', {
        patientName: 'Ana',
        appointmentTime: '09:30',
        clinicAddress: 'Rua A, 10',
      }),
    ).toBe('Ana às 09:30 em Rua A, 10 {{foo}}');
  });
});

describe('applyMondaySendDay', () => {
  // Segunda 05/10/2026 09:00 em Cuiabá = 13:00 UTC.
  const monday = new Date('2026-10-05T13:00:00Z');
  const now = new Date('2026-10-01T12:00:00Z');

  it('lembrete de 24h de consulta na segunda vai para a sexta anterior', () => {
    const sunday = new Date(monday.getTime() - 1440 * 60_000);
    const result = applyMondaySendDay({ scheduledFor: sunday, appointmentStart: monday, timeZone: TZ, mondaySendDay: 'FRIDAY', now });
    expect(result.toISOString()).toBe('2026-10-02T13:00:00.000Z');
  });

  it('48h (sábado) também vai para a sexta', () => {
    const saturday = new Date(monday.getTime() - 2880 * 60_000);
    const result = applyMondaySendDay({ scheduledFor: saturday, appointmentStart: monday, timeZone: TZ, mondaySendDay: 'FRIDAY', now });
    expect(result.toISOString()).toBe('2026-10-02T13:00:00.000Z');
  });

  it('com SUNDAY mantém a véspera', () => {
    const sunday = new Date(monday.getTime() - 1440 * 60_000);
    expect(applyMondaySendDay({ scheduledFor: sunday, appointmentStart: monday, timeZone: TZ, mondaySendDay: 'SUNDAY', now })).toEqual(sunday);
  });

  it('não altera lembrete de 2h na própria segunda nem consultas de outros dias', () => {
    const twoHours = new Date(monday.getTime() - 120 * 60_000);
    expect(applyMondaySendDay({ scheduledFor: twoHours, appointmentStart: monday, timeZone: TZ, mondaySendDay: 'FRIDAY', now })).toEqual(twoHours);
    const tuesday = new Date('2026-10-06T13:00:00Z');
    const eve = new Date(tuesday.getTime() - 1440 * 60_000);
    expect(applyMondaySendDay({ scheduledFor: eve, appointmentStart: tuesday, timeZone: TZ, mondaySendDay: 'FRIDAY', now })).toEqual(eve);
  });

  it('mantém o horário original se a sexta já passou', () => {
    const sunday = new Date(monday.getTime() - 1440 * 60_000);
    const saturdayNow = new Date('2026-10-03T15:00:00Z');
    expect(applyMondaySendDay({ scheduledFor: sunday, appointmentStart: monday, timeZone: TZ, mondaySendDay: 'FRIDAY', now: saturdayNow })).toEqual(sunday);
  });
});

describe('parseInboundReply', () => {
  it.each([
    ['Sim', 'CONFIRM'],
    ['1', 'CONFIRM'],
    ['confirmo!', 'CONFIRM'],
    ['Sim, confirmado', 'CONFIRM'],
    ['Não', 'CANCEL'],
    ['NAO', 'CANCEL'],
    ['2', 'CANCEL'],
    ['cancelar', 'CANCEL'],
    ['Não, obrigado', 'CANCEL'],
    ['✅Sim', 'CONFIRM'],
    ['  sim  ', 'CONFIRM'],
    ['SIM ✅', 'CONFIRM'],
    ['📅 Cancelar', 'CANCEL'],
  ])('%s → %s', (text, intent) => {
    expect(parseInboundReply(text)).toBe(intent);
  });

  it.each(['Bom dia, posso remarcar para quinta à tarde?', 'sim não', 'ok', '', '👍'])('ignora "%s"', (text) => {
    expect(parseInboundReply(text)).toBeNull();
  });
});

describe('phonesMatch', () => {
  it('aceita DDI, máscara e 9º dígito omitido', () => {
    expect(phonesMatch('5565999998888', '(65) 99999-8888')).toBe(true);
    expect(phonesMatch('556599998888', '(65) 99999-8888')).toBe(true);
  });

  it('recusa DDD diferente', () => {
    expect(phonesMatch('5511999998888', '(65) 99999-8888')).toBe(false);
  });
});

describe('readMessageSchedule', () => {
  it('descarta valores fora da faixa', () => {
    expect(readMessageSchedule({ leadMinutes: 5, mondaySendDay: 'MONDAY' })).toEqual({});
    expect(readMessageSchedule({ leadMinutes: 2880, mondaySendDay: 'SUNDAY' })).toEqual({ leadMinutes: 2880, mondaySendDay: 'SUNDAY' });
  });
});

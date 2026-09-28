import { describe, expect, it } from 'vitest';
import { reminderMessageText } from './reminder-message';

const appointment = {
  startAt: new Date('2026-10-05T13:30:00Z'),
  patient: { fullName: 'Ana Souza', preferredName: 'Ana' },
  professional: { name: 'Dra. Paula' },
  clinic: { tradeName: 'Sonder' },
  unit: { name: 'Centro', address: 'Rua das Flores, 100', city: 'Cuiabá', timezone: 'America/Cuiaba' },
};

describe('reminderMessageText', () => {
  it('substitui endereço da clínica e horário do agendamento no modelo', () => {
    expect(
      reminderMessageText('REMINDER', 'Oi {{patientName}}, {{date}} às {{appointmentTime}} em {{clinicAddress}}.', appointment),
    ).toBe('Oi Ana, 05/10/2026 às 09:30 em Rua das Flores, 100 · Cuiabá.');
  });

  it('sem endereço cadastrado usa nome e cidade da unidade', () => {
    const text = reminderMessageText('REMINDER', '{{clinicAddress}}', { ...appointment, unit: { ...appointment.unit, address: null } });
    expect(text).toBe('Centro · Cuiabá');
  });

  it('sem modelo usa o texto padrão; confirmação pede SIM/NÃO', () => {
    expect(reminderMessageText('REMINDER', null, appointment)).toContain('09:30');
    expect(reminderMessageText('CONFIRMATION', '', appointment)).toContain('Responda SIM para confirmar ou NÃO para cancelar');
  });
});

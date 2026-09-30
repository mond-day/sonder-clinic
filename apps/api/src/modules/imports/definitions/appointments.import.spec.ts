import { describe, expect, it } from 'vitest';
import { ProfessionalResolver } from '../import-lookups';
import { patientIndex, professionals, sheetRows, testContext } from '../import-test-fixtures';
import { parseAppointmentRow, planAppointments, resolveAppointmentStatus } from './appointments.import';

const unit = { ok: true as const, value: { id: 'unit-1', timezone: 'America/Cuiaba' } };
const patients = patientIndex([
  { id: 'pat-1', fullName: 'Paciente Agenda Um', primaryPhone: '65999990001' },
  { id: 'pat-2', fullName: 'Paciente Agenda Dois', primaryPhone: '65999990002' },
]);

function plan(rows: Parameters<typeof sheetRows>[0], extra: Partial<Parameters<typeof planAppointments>[1]> = {}) {
  return planAppointments(sheetRows(rows).map(parseAppointmentRow), {
    unit,
    patients,
    professionals: new ProfessionalResolver(professionals),
    tags: new Map([['retorno', { id: 'tag-1', name: 'Retorno' }]]),
    alreadyImported: new Set(),
    existing: [],
    now: testContext.now,
    ...extra,
  });
}

const base = { Paciente: 'Paciente Agenda Um', Profissional: 'Ana Maria Souza', 'Duração (min)': 30 };

describe('importação de consultas', () => {
  it('grava consultas passadas agendadas/confirmadas como concluídas', () => {
    const past = new Date('2026-01-01T12:00:00Z');
    expect(resolveAppointmentStatus('SCHEDULED', past, testContext.now).status).toBe('COMPLETED');
    expect(resolveAppointmentStatus('CONFIRMED', past, testContext.now).status).toBe('COMPLETED');
    expect(resolveAppointmentStatus('CANCELLED', past, testContext.now).status).toBe('CANCELLED');
    expect(resolveAppointmentStatus('NO_SHOW', past, testContext.now).status).toBe('NO_SHOW');
    const future = new Date('2026-12-01T12:00:00Z');
    expect(resolveAppointmentStatus('SCHEDULED', future, testContext.now).status).toBe('SCHEDULED');
  });

  it('converte data/hora no fuso da unidade e cria etiquetas faltantes', () => {
    const result = plan([{ ...base, Data: new Date(Date.UTC(2026, 2, 10)), Hora: '09:00', Status: 'Finalizada', Tags: 'Retorno, Urgência' }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.data.startAt.toISOString()).toBe('2026-03-10T13:00:00.000Z');
    expect(result.items[0]!.data.endAt.toISOString()).toBe('2026-03-10T13:30:00.000Z');
    expect(result.items[0]!.data.status).toBe('COMPLETED');
    expect(result.creations).toEqual([{ label: 'Etiquetas de agenda que serão criadas', names: ['Urgência'] }]);
  });

  it('acusa conflito de horário entre consultas futuras do mesmo profissional', () => {
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
      { ...base, Paciente: 'Paciente Agenda Dois', Data: '10/12/2026', Hora: '09:15', Status: 'Confirmada' },
      { ...base, Profissional: 'Bruno Lima', Data: '10/12/2026', Hora: '09:15', Status: 'Agendada' },
    ]);
    expect(result.rows.map((row) => row.status)).toEqual(['CREATE', 'ERROR', 'CREATE']);
    expect(result.rows[1]!.messages[0]).toMatch(/linha 2/);
    expect(result.warnings[0]).toMatch(/sem lembrete de WhatsApp/);
  });

  it('acusa conflito com consulta ativa existente e pula duplicata exata', () => {
    const startAt = new Date('2026-12-10T13:00:00.000Z');
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
      { ...base, Paciente: 'Paciente Agenda Dois', Data: '10/12/2026', Hora: '09:10', Status: 'Agendada' },
    ], {
      existing: [{ patientId: 'pat-1', professionalId: 'prof-ana', startAt, endAt: new Date('2026-12-10T13:30:00.000Z'), status: 'SCHEDULED' }],
    });
    expect(result.rows.map((row) => row.status)).toEqual(['SKIP', 'ERROR']);
    expect(result.rows[1]!.messages[0]).toMatch(/já existente/);
  });

  it('acusa conflito de cadeira entre profissionais diferentes sem derrubar as outras linhas', () => {
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
      { ...base, Paciente: 'Paciente Agenda Dois', Profissional: 'Bruno Lima', Data: '10/12/2026', Hora: '09:15', Status: 'Agendada' },
      { ...base, Paciente: 'Paciente Agenda Dois', Profissional: 'Bruno Lima', Data: '10/12/2026', Hora: '11:00', Status: 'Agendada' },
    ], { chairId: 'chair-1' });
    expect(result.rows.map((row) => row.status)).toEqual(['CREATE', 'ERROR', 'CREATE']);
    expect(result.rows[1]!.messages[0]).toMatch(/Essa cadeira já tem um atendimento nesse horário/);
    expect(result.items.map((item) => item.data.chairId)).toEqual(['chair-1', 'chair-1']);
  });

  it('não inventa conflito de cadeira quando a linha não ocupa cadeira', () => {
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
      { ...base, Paciente: 'Paciente Agenda Dois', Profissional: 'Bruno Lima', Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
    ]);
    expect(result.rows.map((row) => row.status)).toEqual(['CREATE', 'CREATE']);
    expect(result.items.every((item) => item.data.chairId == null)).toBe(true);
  });

  it('cadeira ocupada por outro profissional na agenda bloqueia a linha', () => {
    const startAt = new Date('2026-12-10T13:00:00.000Z');
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
    ], {
      chairId: 'chair-1',
      existing: [{
        patientId: 'pat-2',
        professionalId: 'prof-bruno',
        chairId: 'chair-1',
        startAt,
        endAt: new Date('2026-12-10T13:30:00.000Z'),
        status: 'SCHEDULED',
      }],
    });
    expect(result.rows[0]!.status).toBe('ERROR');
    expect(result.rows[0]!.messages[0]).toBe('Essa cadeira já tem um atendimento nesse horário.');
  });

  it('cancelamento na mesma cadeira não bloqueia a linha', () => {
    const startAt = new Date('2026-12-10T13:00:00.000Z');
    const result = plan([
      { ...base, Data: '10/12/2026', Hora: '09:00', Status: 'Agendada' },
    ], {
      chairId: 'chair-1',
      existing: [{
        patientId: 'pat-2',
        professionalId: 'prof-bruno',
        chairId: 'chair-1',
        startAt,
        endAt: new Date('2026-12-10T13:30:00.000Z'),
        status: 'CANCELLED',
      }],
    });
    expect(result.rows[0]!.status).toBe('CREATE');
  });

  it('não inventa profissional nem paciente', () => {
    const result = plan([
      { ...base, Profissional: 'Fulano Inexistente', Data: '10/03/2026', Hora: '09:00', Status: 'Finalizada' },
      { ...base, Paciente: 'Desconhecido Total', Data: '10/03/2026', Hora: '10:00', Status: 'Finalizada' },
      { ...base, Profissional: 'Carla Dias', Data: '10/03/2026', Hora: '11:00', Status: 'Finalizada' },
    ]);
    expect(result.rows.map((row) => row.status)).toEqual(['ERROR', 'ERROR', 'ERROR']);
    expect(result.rows[0]!.messages[0]).toMatch(/não está cadastrado/);
    expect(result.rows[1]!.messages[0]).toMatch(/não encontrado/);
    expect(result.rows[2]!.messages[0]).toMatch(/vínculo ativo/);
  });

  it('bloqueia o lote sem unidade definida e rejeita status desconhecido', () => {
    const blocked = plan([{ ...base, Data: '10/03/2026', Hora: '09:00', Status: 'Finalizada' }], {
      unit: { ok: false, error: 'Selecione a unidade.' },
    });
    expect(blocked.blocking).toEqual(['Selecione a unidade.']);
    expect(blocked.items).toHaveLength(0);
    const [row] = sheetRows([{ ...base, Data: '10/03/2026', Hora: '09:00', Status: 'Remarcada' }]).map(parseAppointmentRow);
    expect(row!.errors[0]).toMatch(/não reconhecido/);
  });
});

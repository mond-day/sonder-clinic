import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tx, db } = vi.hoisted(() => {
  const tx = {
    appointment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
    },
    appointmentReminder: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    outboxEvent: { create: vi.fn() },
    returnAlert: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    integrationConnection: { findFirst: vi.fn() },
    messageTemplate: { findMany: vi.fn() },
  };
  const db = {
    clinic: { findFirst: vi.fn() },
    unit: { findFirst: vi.fn() },
    patient: { findFirst: vi.fn() },
    professional: { findFirst: vi.fn() },
    chair: { findFirst: vi.fn() },
    agendaTag: { count: vi.fn() },
    appointment: { findFirst: vi.fn() },
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => Promise.resolve(run(tx))),
  };
  return { tx, db };
});

vi.mock('@sonder/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sonder/database')>()),
  prisma: db,
}));

import { WHATSAPP_NOT_CONFIGURED_REASON } from '@sonder/database';
import { SchedulingService, type AppointmentInput } from './scheduling.service';
import type { IntegrationsService } from '../integrations/integrations.service';

const ids = {
  clinic: '11111111-1111-4111-8111-111111111111',
  unit: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  professional: '44444444-4444-4444-8444-444444444444',
  appointment: '55555555-5555-4555-8555-555555555555',
};

const base: AppointmentInput = {
  clinicId: ids.clinic,
  unitId: ids.unit,
  professionalId: ids.professional,
  startAt: '2026-10-01T15:00:00.000Z',
  endAt: '2026-10-01T16:00:00.000Z',
};

describe('SchedulingService compromissos', () => {
  const integrations = { findPersonalCalendarWarnings: vi.fn().mockResolvedValue([]) };
  let service: SchedulingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SchedulingService(integrations as unknown as IntegrationsService);
    db.clinic.findFirst.mockResolvedValue({ id: ids.clinic });
    db.unit.findFirst.mockResolvedValue({ id: ids.unit });
    db.patient.findFirst.mockResolvedValue({ id: ids.patient });
    db.professional.findFirst.mockResolvedValue({ id: ids.professional });
    tx.appointment.findFirst.mockResolvedValue(null);
    tx.appointment.create.mockResolvedValue({ id: ids.appointment });
    tx.appointment.update.mockResolvedValue({ id: ids.appointment });
    tx.appointment.findUniqueOrThrow.mockResolvedValue({ id: ids.appointment });
  });

  it('consulta continua exigindo paciente', async () => {
    await expect(service.create('org-1', base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('compromisso exige título', async () => {
    await expect(service.create('org-1', { ...base, kind: 'COMMITMENT', title: '   ' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('compromisso não aceita paciente', async () => {
    await expect(service.create('org-1', { ...base, kind: 'COMMITMENT', title: 'Reunião', patientId: ids.patient }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('compromisso não aceita status de atendimento', async () => {
    await expect(service.create('org-1', { ...base, kind: 'COMMITMENT', title: 'Reunião', status: 'CHECKED_IN' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria compromisso sem paciente, sem lembrete e checando conflito do profissional', async () => {
    await service.create('org-1', {
      ...base,
      kind: 'COMMITMENT',
      title: '  Almoço  ',
      reminderEnabled: true,
    });

    expect(db.patient.findFirst).not.toHaveBeenCalled();
    expect(tx.appointment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ professionalId: ids.professional }] }),
    }));
    expect(tx.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'COMMITMENT', patientId: null, title: 'Almoço' }),
    }));
    expect(tx.appointmentReminder.create).not.toHaveBeenCalled();
  });

  it('recusa a mesma cadeira em outro profissional com mensagem específica', async () => {
    const chairId = '66666666-6666-4666-8666-666666666666';
    db.chair.findFirst.mockResolvedValue({ id: chairId });
    tx.appointment.findFirst.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      professionalId: '77777777-7777-4777-8777-777777777777',
      chairId,
    });

    const error = await service.create('org-1', {
      ...base,
      patientId: ids.patient,
      chairId,
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: 'Essa cadeira já tem um atendimento nesse horário.',
      details: { resourceType: 'CHAIR' },
    });
    expect(tx.appointment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] },
        OR: [{ professionalId: ids.professional }, { chairId }],
      }),
    }));
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('consulta sem cadeira não entra no filtro de cadeira', async () => {
    await service.create('org-1', { ...base, patientId: ids.patient });
    const where = tx.appointment.findFirst.mock.calls[0]?.[0] as { where: { OR: unknown[] } };
    expect(where.where.OR).toEqual([{ professionalId: ids.professional }]);
  });

  it('check-conflicts devolve a mensagem da cadeira', async () => {
    const chairId = '66666666-6666-4666-8666-666666666666';
    db.appointment.findFirst.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      professionalId: '77777777-7777-4777-8777-777777777777',
      chairId,
    });
    await expect(service.checkConflict('org-1', { ...base, patientId: ids.patient, chairId })).resolves.toMatchObject({
      conflict: true,
      message: 'Essa cadeira já tem um atendimento nesse horário.',
      details: { resourceType: 'CHAIR' },
    });
  });

  it('consulta ignora título e mantém paciente', async () => {
    await service.create('org-1', { ...base, patientId: ids.patient, title: 'ignorado' });
    expect(tx.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'APPOINTMENT', patientId: ids.patient, title: null }),
    }));
  });

  it('não converte consulta em compromisso ao editar', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: ids.appointment, kind: 'APPOINTMENT', status: 'SCHEDULED' });
    await expect(service.reschedule('org-1', ids.appointment, { ...base, kind: 'COMMITMENT', title: 'Reunião' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('concluir compromisso não dispara automação de consulta concluída', async () => {
    db.appointment.findFirst.mockResolvedValue({ id: ids.appointment, kind: 'COMMITMENT', status: 'SCHEDULED' });
    await service.reschedule('org-1', ids.appointment, { ...base, title: 'Reunião', status: 'COMPLETED' });
    const eventTypes = tx.outboxEvent.create.mock.calls.map(([arg]) => (arg as { data: { eventType: string } }).data.eventType);
    expect(eventTypes).not.toContain('appointment.completed');
    expect(tx.appointment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ patientId: null, title: 'Reunião' }),
    }));
  });
});

describe('SchedulingService lembrete WhatsApp ao salvar', () => {
  const integrations = { findPersonalCalendarWarnings: vi.fn().mockResolvedValue([]) };
  let service: SchedulingService;
  const consulta = { ...base, patientId: ids.patient, reminderEnabled: true, reminderLeadMinutes: 1440 };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SchedulingService(integrations as unknown as IntegrationsService);
    db.clinic.findFirst.mockResolvedValue({ id: ids.clinic });
    db.unit.findFirst.mockResolvedValue({ id: ids.unit });
    db.patient.findFirst.mockResolvedValue({ id: ids.patient });
    db.professional.findFirst.mockResolvedValue({ id: ids.professional });
    db.appointment.findFirst.mockResolvedValue({ id: ids.appointment, kind: 'APPOINTMENT', status: 'SCHEDULED' });
    tx.appointment.findFirst.mockResolvedValue(null);
    tx.appointment.update.mockResolvedValue({ id: ids.appointment });
    tx.appointment.findUniqueOrThrow.mockResolvedValue({ id: ids.appointment });
    tx.appointment.findUnique.mockResolvedValue({ unit: { timezone: 'America/Cuiaba' } });
    tx.messageTemplate.findMany.mockResolvedValue([]);
    tx.appointmentReminder.create.mockResolvedValue({ id: 'rem-1' });
  });

  it('com Chatwoot ativo na clínica da consulta, salvar recria o lembrete antigo como PENDING e enfileira', async () => {
    tx.integrationConnection.findFirst.mockResolvedValue({ id: 'conn-cw' });

    await service.reschedule('org-1', ids.appointment, consulta);

    expect(tx.appointmentReminder.deleteMany).toHaveBeenCalledWith({
      where: { appointmentId: ids.appointment, channel: { startsWith: 'WHATSAPP' } },
    });
    expect(tx.integrationConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clinicId: ids.clinic,
        provider: { in: ['EVOLUTION', 'CHATWOOT'] },
        status: 'ACTIVE',
      }),
    }));
    expect(tx.appointmentReminder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', statusReason: null }),
    }));
    const eventTypes = tx.outboxEvent.create.mock.calls.map(([arg]) => (arg as { data: { eventType: string } }).data.eventType);
    expect(eventTypes).toContain('appointment.whatsapp-reminder.requested');
  });

  it('sem WhatsApp ativo na clínica, grava DISABLED com o motivo compartilhado e não enfileira', async () => {
    tx.integrationConnection.findFirst.mockResolvedValue(null);

    await service.reschedule('org-1', ids.appointment, consulta);

    expect(tx.appointmentReminder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DISABLED', statusReason: WHATSAPP_NOT_CONFIGURED_REASON }),
    }));
    const eventTypes = tx.outboxEvent.create.mock.calls.map(([arg]) => (arg as { data: { eventType: string } }).data.eventType);
    expect(eventTypes).not.toContain('appointment.whatsapp-reminder.requested');
  });

  describe('sem mudar o horário (ex.: trocar status ou observação)', () => {
    const sameStart = new Date(base.startAt);

    beforeEach(() => {
      db.appointment.findFirst.mockResolvedValue({
        id: ids.appointment, kind: 'APPOINTMENT', status: 'SCHEDULED', startAt: sameStart,
      });
      tx.integrationConnection.findFirst.mockResolvedValue({ id: 'conn-cw' });
      tx.messageTemplate.findMany.mockResolvedValue([
        { category: 'REMINDER', schedule: { leadMinutes: 1440 } },
        { category: 'CONFIRMATION', schedule: { leadMinutes: 1500 } },
      ]);
    });

    it('mantém confirmação e lembrete já enviados e não enfileira outra mensagem', async () => {
      tx.appointmentReminder.findMany.mockResolvedValue([
        { id: 'rem-sent', channel: 'WHATSAPP', leadMinutes: 1440 },
        { id: 'conf-sent', channel: 'WHATSAPP:CONFIRMATION', leadMinutes: 1500 },
      ]);

      await service.reschedule('org-1', ids.appointment, { ...consulta, status: 'CONFIRMED' });

      expect(tx.appointmentReminder.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ appointmentId: ids.appointment, status: { in: ['SENT', 'SENDING'] } }),
      }));
      expect(tx.appointmentReminder.deleteMany).toHaveBeenCalledWith({
        where: {
          appointmentId: ids.appointment,
          channel: { startsWith: 'WHATSAPP' },
          id: { notIn: ['rem-sent', 'conf-sent'] },
        },
      });
      expect(tx.appointmentReminder.create).not.toHaveBeenCalled();
      const eventTypes = tx.outboxEvent.create.mock.calls.map(([arg]) => (arg as { data: { eventType: string } }).data.eventType);
      expect(eventTypes).not.toContain('appointment.whatsapp-reminder.requested');
    });

    it('recria só o que ainda não saiu (confirmação enviada, lembrete pendente)', async () => {
      tx.appointmentReminder.findMany.mockResolvedValue([
        { id: 'conf-sent', channel: 'WHATSAPP:CONFIRMATION', leadMinutes: 1500 },
      ]);

      await service.reschedule('org-1', ids.appointment, consulta);

      const channels = tx.appointmentReminder.create.mock.calls
        .map(([arg]) => (arg as { data: { channel: string } }).data.channel);
      expect(channels).toEqual(['WHATSAPP']);
    });

    it('acrescentar uma segunda antecedência não reenvia a que já saiu', async () => {
      tx.appointmentReminder.findMany.mockResolvedValue([
        { id: 'rem-sent', channel: 'WHATSAPP', leadMinutes: 1440 },
      ]);

      await service.reschedule('org-1', ids.appointment, { ...consulta, reminderLeadMinutes: [1440, 120] });

      const created = tx.appointmentReminder.create.mock.calls
        .map(([arg]) => (arg as { data: { channel: string } }).data.channel);
      expect(created).toEqual(['WHATSAPP:120', 'WHATSAPP:CONFIRMATION']);
    });

    it('antecedência alterada gera novo envio', async () => {
      tx.appointmentReminder.findMany.mockResolvedValue([
        { id: 'rem-sent', channel: 'WHATSAPP', leadMinutes: 1440 },
      ]);

      await service.reschedule('org-1', ids.appointment, { ...consulta, reminderLeadMinutes: 120 });

      expect(tx.appointmentReminder.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ channel: 'WHATSAPP', leadMinutes: 120, status: 'PENDING' }),
      }));
    });
  });

  it('sem antecedência explícita usa só o primeiro Lembrete por nome e um pedido de Confirmação', async () => {
    tx.integrationConnection.findFirst.mockResolvedValue({ id: 'conn-cw' });
    tx.appointment.create.mockResolvedValue({ id: ids.appointment });
    tx.messageTemplate.findMany.mockResolvedValue([
      { category: 'REMINDER', schedule: { leadMinutes: 120 } },
      { category: 'REMINDER', schedule: { leadMinutes: 2880 } },
      { category: 'CONFIRMATION', schedule: { leadMinutes: 1500 } },
    ]);

    await service.create('org-1', { ...base, patientId: ids.patient, reminderEnabled: true });

    expect(tx.messageTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true, category: { in: ['REMINDER', 'CONFIRMATION'] } }),
      orderBy: { name: 'asc' },
    }));
    const created = tx.appointmentReminder.create.mock.calls.map(([arg]) => (
      arg as { data: { channel: string; leadMinutes: number } }
    ).data);
    expect(created).toEqual([
      expect.objectContaining({ channel: 'WHATSAPP', leadMinutes: 120 }),
      expect.objectContaining({ channel: 'WHATSAPP:CONFIRMATION', leadMinutes: 1500 }),
    ]);
  });

  it('antecedência escolhida na consulta prevalece sobre a do modelo de Lembrete', async () => {
    tx.integrationConnection.findFirst.mockResolvedValue({ id: 'conn-cw' });
    tx.appointment.create.mockResolvedValue({ id: ids.appointment });
    tx.messageTemplate.findMany.mockResolvedValue([
      { category: 'REMINDER', schedule: { leadMinutes: 1440 } },
      { category: 'CONFIRMATION', schedule: { leadMinutes: 1500 } },
    ]);

    await service.create('org-1', {
      ...base,
      patientId: ids.patient,
      reminderEnabled: true,
      reminderLeadMinutes: 2880,
    });

    const created = tx.appointmentReminder.create.mock.calls.map(([arg]) => (
      arg as { data: { channel: string; leadMinutes: number } }
    ).data);
    expect(created).toEqual([
      expect.objectContaining({ channel: 'WHATSAPP', leadMinutes: 2880 }),
      expect.objectContaining({ channel: 'WHATSAPP:CONFIRMATION', leadMinutes: 1500 }),
    ]);
  });

  it('remarcar para outro horário recria os lembretes (paciente precisa do aviso novo)', async () => {
    db.appointment.findFirst.mockResolvedValue({
      id: ids.appointment, kind: 'APPOINTMENT', status: 'SCHEDULED', startAt: new Date('2026-10-01T13:00:00.000Z'),
    });
    tx.integrationConnection.findFirst.mockResolvedValue({ id: 'conn-cw' });

    await service.reschedule('org-1', ids.appointment, consulta);

    expect(tx.appointmentReminder.findMany).not.toHaveBeenCalled();
    expect(tx.appointmentReminder.deleteMany).toHaveBeenCalledWith({
      where: { appointmentId: ids.appointment, channel: { startsWith: 'WHATSAPP' } },
    });
    expect(tx.appointmentReminder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING' }),
    }));
  });

  it('cria alerta de retorno junto com a consulta', async () => {
    await service.create('org-1', {
      ...base,
      patientId: ids.patient,
      returnAlert: { dueAt: '2026-11-01T15:00:00.000Z', reason: 'Reavaliação' },
    });

    expect(tx.returnAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: ids.patient,
        reason: 'Reavaliação',
        appointmentId: ids.appointment,
        dueAt: new Date('2026-11-01T15:00:00.000Z'),
      }),
    });
  });

  it('recusa retorno anterior ao fim da consulta', async () => {
    await expect(service.create('org-1', {
      ...base,
      patientId: ids.patient,
      returnAlert: { dueAt: '2026-10-01T15:30:00.000Z' },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.returnAlert.create).not.toHaveBeenCalled();
  });

  it('marca como agendado o retorno que a consulta resolve', async () => {
    tx.returnAlert.findFirst.mockResolvedValue({ id: 'alert-1' });

    await service.create('org-1', { ...base, patientId: ids.patient, returnAlertId: '99999999-9999-4999-8999-999999999999' });

    expect(tx.returnAlert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { status: 'SCHEDULED', appointmentId: ids.appointment },
    });
  });
});

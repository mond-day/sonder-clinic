import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';
import { IntegrationsService, type PersonalCalendarWarning } from '../integrations/integrations.service';

const appointmentSchema = z.object({
  clinicId: z.string().uuid(),
  unitId: z.string().uuid(),
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  chairId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().trim().optional(),
  category: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  tagIds: z.array(z.string().uuid()).max(12).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderLeadMinutes: z.union([
    z.number().int().min(15).max(10080),
    // [] é aceito quando reminderEnabled===false (defesa para clientes legados).
    z.array(z.number().int().min(15).max(10080)).max(5),
  ]).optional(),
  source: z.enum(['INTERNAL', 'API']).optional(),
}).superRefine((value, ctx) => {
  if (
    Array.isArray(value.reminderLeadMinutes)
    && value.reminderLeadMinutes.length === 0
    && value.reminderEnabled !== false
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Informe ao menos uma antecedência de lembrete, ou desative o lembrete.',
      path: ['reminderLeadMinutes'],
    });
  }
});

export type AppointmentInput = {
  clinicId: string;
  unitId: string;
  patientId: string;
  professionalId: string;
  chairId?: string;
  startAt: string;
  endAt: string;
  notes?: string;
  category?: string;
  status?: 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  tagIds?: string[];
  reminderEnabled?: boolean;
  reminderLeadMinutes?: number | number[];
  source?: 'INTERNAL' | 'API';
};

export type CheckConflictInput = AppointmentInput & {
  excludeAppointmentId?: string;
};

const appointmentInclude = {
  patient: true,
  professional: true,
  chair: true,
  tags: { include: { tag: true } },
  reminders: true,
} as const;

@Injectable()
export class SchedulingService {
  constructor(private readonly integrations: IntegrationsService) {}

  list(organizationId: string, from?: string, to?: string, clinicId?: string) {
    return prisma.appointment.findMany({
      where: {
        organizationId,
        clinicId,
        startAt: {
          gte: from ? new Date(from) : undefined,
          lt: to ? new Date(to) : undefined,
        },
      },
      include: appointmentInclude,
      orderBy: { startAt: 'asc' },
      take: 500,
    });
  }

  async find(organizationId: string, id: string) {
    const appointment = await prisma.appointment.findFirst({
      where: { id, organizationId },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    return appointment;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: AppointmentInput['status'],
  ) {
    if (!status) throw new ConflictException('Status inválido.');
    if (status === 'CANCELLED') return this.cancel(organizationId, id);
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    if (appointment.status === 'CANCELLED') {
      throw new ConflictException('Agendamento cancelado não pode mudar de status.');
    }
    return prisma.appointment.update({
      where: { id },
      data: { status, version: { increment: 1 } },
      include: appointmentInclude,
    });
  }

  personalCalendarStatus(organizationId: string, clinicId: string) {
    return this.integrations.googleCalendarClinicAvailability(organizationId, clinicId);
  }

  listPersonalCalendar(
    organizationId: string,
    clinicId: string,
    from: string,
    to: string,
    professionalId?: string,
  ) {
    return this.integrations.listPersonalGoogleEvents(
      organizationId,
      clinicId,
      from,
      to,
      professionalId,
    );
  }

  async create(organizationId: string, input: AppointmentInput) {
    parseWithZod(appointmentSchema, input);
    await this.assertResources(organizationId, input);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (startAt >= endAt) throw new ConflictException('O término deve ser posterior ao início.');

    const created = await prisma.$transaction(async (transaction) => {
      const conflict = await transaction.appointment.findFirst({
        where: {
          organizationId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
          OR: [
            { professionalId: input.professionalId },
            ...(input.chairId ? [{ chairId: input.chairId }] : []),
          ],
        },
        select: { id: true, professionalId: true, chairId: true },
      });
      if (conflict) {
        throw new ConflictException({
          code: 'APPOINTMENT_RESOURCE_CONFLICT',
          message: 'O horário selecionado está em conflito com outro agendamento.',
          details: {
            conflictingAppointmentId: conflict.id,
            resourceType: conflict.professionalId === input.professionalId ? 'PROFESSIONAL' : 'CHAIR',
          },
        });
      }

      const { tagIds = [], reminderEnabled, reminderLeadMinutes = 1440, ...appointment } = input;
      const row = await transaction.appointment.create({
        data: {
          organizationId,
          ...appointment,
          startAt,
          endAt,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
        include: appointmentInclude,
      });
      await this.configureReminder(transaction, organizationId, row.id, input.clinicId, startAt, reminderEnabled, reminderLeadMinutes);
      await this.enqueueCalendarSync(transaction, row.id, 'UPSERT');
      return transaction.appointment.findUniqueOrThrow({ where: { id: row.id }, include: appointmentInclude });
    }, { isolationLevel: 'Serializable' });

    const warnings = await this.safePersonalWarnings(organizationId, input);
    return { ...created, warnings };
  }

  async reschedule(organizationId: string, id: string, input: AppointmentInput) {
    parseWithZod(appointmentSchema, input);
    await this.assertResources(organizationId, input);
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    if (appointment.status === 'CANCELLED') throw new ConflictException('Agendamento cancelado não pode ser remarcado.');
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (startAt >= endAt) throw new ConflictException('O término deve ser posterior ao início.');
    const updated = await prisma.$transaction(async (transaction) => {
      const conflict = await transaction.appointment.findFirst({
        where: {
          id: { not: id },
          organizationId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
          OR: [
            { professionalId: input.professionalId },
            ...(input.chairId ? [{ chairId: input.chairId }] : []),
          ],
        },
      });
      if (conflict) throw new ConflictException('O horário selecionado está em conflito com outro agendamento.');
      const { tagIds, reminderEnabled, reminderLeadMinutes = 1440, ...appointmentData } = input;
      const row = await transaction.appointment.update({
        where: { id },
        data: {
          ...appointmentData,
          startAt,
          endAt,
          version: { increment: 1 },
          ...(tagIds ? { tags: { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) } } : {}),
        },
        include: appointmentInclude,
      });
      await this.configureReminder(transaction, organizationId, id, input.clinicId, startAt, reminderEnabled, reminderLeadMinutes);
      await this.enqueueCalendarSync(transaction, id, 'UPSERT');
      if (input.status === 'COMPLETED' && appointment.status !== 'COMPLETED') {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'Appointment',
            aggregateId: id,
            eventType: 'appointment.completed',
            payload: {
              appointmentId: id,
              organizationId,
              clinicId: input.clinicId,
              patientId: input.patientId,
              professionalId: input.professionalId,
              category: input.category ?? null,
            },
          },
        });
      }
      return transaction.appointment.findUniqueOrThrow({ where: { id: row.id }, include: appointmentInclude });
    }, { isolationLevel: 'Serializable' });

    const warnings = await this.safePersonalWarnings(organizationId, input, id);
    return { ...updated, warnings };
  }

  async cancel(organizationId: string, id: string) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    if (appointment.status === 'CANCELLED') return appointment;
    if (appointment.status === 'COMPLETED') throw new ConflictException('Consulta concluída não pode ser cancelada.');
    return prisma.$transaction(async (transaction) => {
      const cancelled = await transaction.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      await this.enqueueCalendarSync(transaction, id, 'DELETE');
      return cancelled;
    });
  }

  async checkConflict(organizationId: string, input: CheckConflictInput) {
    const conflict = await this.findConflict(organizationId, input);
    const warnings = await this.safePersonalWarnings(
      organizationId,
      input,
      input.excludeAppointmentId,
    );
    return {
      conflict: Boolean(conflict),
      warnings,
      ...(conflict
        ? {
            details: {
              conflictingAppointmentId: conflict.id,
              resourceType: conflict.professionalId === input.professionalId ? 'PROFESSIONAL' : 'CHAIR',
            },
          }
        : {}),
    };
  }

  private async safePersonalWarnings(
    organizationId: string,
    input: Pick<AppointmentInput, 'clinicId' | 'professionalId' | 'startAt' | 'endAt'>,
    excludeAppointmentId?: string,
  ): Promise<PersonalCalendarWarning[]> {
    try {
      return await this.integrations.findPersonalCalendarWarnings(organizationId, {
        clinicId: input.clinicId,
        professionalId: input.professionalId,
        startAt: input.startAt,
        endAt: input.endAt,
        excludeAppointmentId,
      });
    } catch {
      return [];
    }
  }

  private findConflict(organizationId: string, input: CheckConflictInput) {
    return prisma.appointment.findFirst({
      where: {
        organizationId,
        ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startAt: { lt: new Date(input.endAt) },
        endAt: { gt: new Date(input.startAt) },
        OR: [
          { professionalId: input.professionalId },
          ...(input.chairId ? [{ chairId: input.chairId }] : []),
        ],
      },
      select: { id: true, professionalId: true, chairId: true },
    });
  }

  private async assertResources(organizationId: string, input: AppointmentInput) {
    const [clinic, unit, patient, professional, chair, tagCount] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.unit.findFirst({ where: { id: input.unitId, clinicId: input.clinicId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.patient.findFirst({ where: { id: input.patientId, organizationId, status: { not: 'ARCHIVED' } }, select: { id: true } }),
      prisma.professional.findFirst({
        where: {
          id: input.professionalId,
          user: { organizationId },
          status: 'ACTIVE',
          clinicLinks: { some: { clinicId: input.clinicId, active: true } },
        },
        select: { id: true },
      }),
      input.chairId
        ? prisma.chair.findFirst({
            where: { id: input.chairId, unitId: input.unitId, status: 'ACTIVE', isSchedulingEnabled: true },
            select: { id: true },
          })
        : Promise.resolve({ id: 'optional' }),
      input.tagIds?.length
        ? prisma.agendaTag.count({ where: { id: { in: input.tagIds }, organizationId, clinicId: input.clinicId, active: true } })
        : Promise.resolve(0),
    ]);
    if (!clinic) throw new NotFoundException('Clínica inválida ou inativa.');
    if (!unit) throw new NotFoundException('Unidade inválida para a clínica selecionada.');
    if (!patient) throw new NotFoundException('Paciente inválido ou arquivado.');
    if (!professional) throw new NotFoundException('Profissional inválido ou sem vínculo ativo com a clínica.');
    if (!chair) {
      throw new NotFoundException(
        input.chairId
          ? 'Cadeira inválida, inativa, ou não pertence à unidade selecionada.'
          : 'Cadeira inválida.',
      );
    }
    if (tagCount !== new Set(input.tagIds ?? []).size) {
      throw new NotFoundException('Uma ou mais etiquetas da agenda são inválidas para esta clínica.');
    }
  }

  private async enqueueCalendarSync(
    transaction: Prisma.TransactionClient,
    appointmentId: string,
    action: 'UPSERT' | 'DELETE',
  ) {
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'Appointment',
        aggregateId: appointmentId,
        eventType: 'appointment.calendar-sync.requested',
        payload: { appointmentId, action },
      },
    });
  }

  private async configureReminder(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    appointmentId: string,
    clinicId: string,
    startAt: Date,
    enabled = false,
    leadMinutes: number | number[] = 1440,
  ) {
    const leads = (Array.isArray(leadMinutes) ? leadMinutes : [leadMinutes])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 15 && value <= 10080);
    const uniqueLeads = [...new Set(leads.length ? leads : [1440])];

    await transaction.appointmentReminder.deleteMany({
      where: { appointmentId, channel: { startsWith: 'WHATSAPP' } },
    });

    if (!enabled) return;

    const evolution = await transaction.integrationConnection.findFirst({
      where: { clinicId, provider: 'EVOLUTION', status: 'ACTIVE', encryptedCredentials: { not: null } },
      select: { id: true },
    });

    for (const minutes of uniqueLeads) {
      const channel = uniqueLeads.length === 1 ? 'WHATSAPP' : `WHATSAPP:${minutes}`;
      const scheduledFor = new Date(startAt.getTime() - minutes * 60_000);
      const reminder = await transaction.appointmentReminder.create({
        data: {
          organizationId,
          appointmentId,
          channel,
          leadMinutes: minutes,
          scheduledFor,
          status: evolution ? 'PENDING' : 'DISABLED',
          statusReason: evolution ? null : 'Evolution não configurado.',
        },
      });
      if (evolution) {
        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'AppointmentReminder',
            aggregateId: reminder.id,
            eventType: 'appointment.whatsapp-reminder.requested',
            payload: { reminderId: reminder.id, appointmentId, scheduledFor: scheduledFor.toISOString(), leadMinutes: minutes },
          },
        });
      }
    }
  }
}

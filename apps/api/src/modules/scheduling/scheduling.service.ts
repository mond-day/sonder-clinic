import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const appointmentSchema = z.object({
  clinicId: z.string().uuid(),
  unitId: z.string().uuid(),
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  chairId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().trim().optional(),
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
};

@Injectable()
export class SchedulingService {
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
      include: { patient: true, professional: true, chair: true },
      orderBy: { startAt: 'asc' },
      take: 500,
    });
  }

  async create(organizationId: string, input: AppointmentInput) {
    parseWithZod(appointmentSchema, input);
    await this.assertResources(organizationId, input);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (startAt >= endAt) throw new ConflictException('O término deve ser posterior ao início.');

    return prisma.$transaction(async (transaction) => {
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

      return transaction.appointment.create({
        data: { organizationId, ...input, startAt, endAt },
        include: { patient: true, professional: true, chair: true },
      });
    }, { isolationLevel: 'Serializable' });
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
    return prisma.$transaction(async (transaction) => {
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
      return transaction.appointment.update({
        where: { id },
        data: { ...input, startAt, endAt, version: { increment: 1 } },
        include: { patient: true, professional: true, chair: true },
      });
    }, { isolationLevel: 'Serializable' });
  }

  async cancel(organizationId: string, id: string) {
    const appointment = await prisma.appointment.findFirst({ where: { id, organizationId } });
    if (!appointment) throw new NotFoundException('Agendamento não encontrado.');
    if (appointment.status === 'CANCELLED') return appointment;
    if (appointment.status === 'COMPLETED') throw new ConflictException('Consulta concluída não pode ser cancelada.');
    return prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
  }

  async checkConflict(organizationId: string, input: AppointmentInput) {
    const conflict = await this.findConflict(organizationId, input);
    return {
      conflict: Boolean(conflict),
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

  private findConflict(organizationId: string, input: AppointmentInput) {
    return prisma.appointment.findFirst({
      where: {
        organizationId,
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
    const [clinic, unit, patient, professional, chair] = await Promise.all([
      prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.unit.findFirst({ where: { id: input.unitId, clinicId: input.clinicId, status: 'ACTIVE' }, select: { id: true } }),
      prisma.patient.findFirst({ where: { id: input.patientId, organizationId, status: { not: 'ARCHIVED' } }, select: { id: true } }),
      prisma.professional.findFirst({ where: { id: input.professionalId, user: { organizationId }, status: 'ACTIVE' }, select: { id: true } }),
      input.chairId ? prisma.chair.findFirst({ where: { id: input.chairId, unitId: input.unitId, status: 'ACTIVE', isSchedulingEnabled: true }, select: { id: true } }) : Promise.resolve({ id: 'optional' }),
    ]);
    if (!clinic || !unit || !patient || !professional || !chair) {
      throw new NotFoundException('Clínica, unidade, paciente, profissional ou cadeira inválidos.');
    }
  }
}

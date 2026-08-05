import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const patientDataSchema = z.object({
  fullName: z.string().trim().min(3),
  preferredName: z.string().trim().optional(),
  cpf: z.string().regex(/^\d{11}$/).optional(),
  birthDate: z.string().date().optional(),
  email: z.string().email().optional(),
  primaryPhone: z.string().trim().min(10),
  isMinor: z.boolean().optional(),
});

export type CreatePatientInput = {
  fullName: string;
  preferredName?: string;
  cpf?: string;
  birthDate?: string;
  email?: string;
  primaryPhone: string;
  isMinor?: boolean;
  clinicId: string;
};

@Injectable()
export class PatientsService {
  async list(organizationId: string, search?: string, clinicId?: string) {
    return prisma.patient.findMany({
      where: {
        organizationId,
        status: { not: 'ARCHIVED' },
        clinics: clinicId ? { some: { clinicId, status: 'ACTIVE' } } : undefined,
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' as const } },
                { cpf: { contains: search } },
                { primaryPhone: { contains: search } },
              ],
            }
          : {}),
      },
      include: { alerts: { where: { active: true } }, clinics: true },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
  }

  async find(organizationId: string, id: string) {
    const patient = await prisma.patient.findFirst({
      where: { id, organizationId },
      include: { guardians: { include: { guardian: true } }, alerts: true, clinics: true },
    });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    return patient;
  }

  async create(organizationId: string, input: CreatePatientInput) {
    parseWithZod(patientDataSchema, input);
    if (input.cpf) {
      const duplicate = await prisma.patient.findFirst({ where: { organizationId, cpf: input.cpf } });
      if (duplicate) throw new ConflictException('Já existe um paciente com este CPF.');
    }
    return prisma.patient.create({
      data: {
        organizationId,
        fullName: input.fullName,
        preferredName: input.preferredName,
        cpf: input.cpf,
        birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : undefined,
        email: input.email,
        primaryPhone: input.primaryPhone,
        isMinor: input.isMinor ?? false,
        clinics: { create: { clinicId: input.clinicId } },
      },
    });
  }

  async update(organizationId: string, id: string, input: Omit<CreatePatientInput, 'clinicId'>) {
    const data = parseWithZod(patientDataSchema, input);
    await this.find(organizationId, id);
    if (data.cpf) {
      const duplicate = await prisma.patient.findFirst({
        where: { organizationId, cpf: data.cpf, id: { not: id } },
      });
      if (duplicate) throw new ConflictException('Já existe um paciente com este CPF.');
    }
    return prisma.patient.update({
      where: { id },
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00.000Z`) : null,
        preferredName: data.preferredName || null,
        cpf: data.cpf || null,
        email: data.email || null,
      },
    });
  }

  async archive(organizationId: string, id: string) {
    await this.find(organizationId, id);
    return prisma.patient.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }
}

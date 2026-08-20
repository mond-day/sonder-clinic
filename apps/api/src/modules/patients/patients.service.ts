import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sonder/database';
import { z } from 'zod';
import {
  assertClinicInScope,
  patientClinicFilter,
  type ClinicScope,
} from '../../common/clinic-scope';
import { parseWithZod } from '../../common/zod-validation';
import {
  addPatientGuardian,
  createPatientAlert,
  listCommunicationPreferences,
  mergePatients,
  unlinkPatientGuardian,
  updatePatientAlert,
  updatePatientGuardian,
  upsertCommunicationPreference,
} from './patients-guardians-merge.utils';
import {
  dismissPatientDuplicate,
  listPatientDuplicates,
  previewPatientMerge,
} from './patients-duplicates.utils';

const brazilianPostalCode = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => value.length === 0 || value.length === 8, 'CEP deve ter 8 dígitos.')
  .optional();

const patientDataSchema = z.object({
  fullName: z.string().trim().min(3),
  preferredName: z.string().trim().optional(),
  cpf: z.string().regex(/^\d{11}$/).optional(),
  passportNumber: z.string().trim().min(5).max(40).optional(),
  birthDate: z.string().date().optional(),
  email: z.string().email().optional(),
  primaryPhone: z.string().trim().min(10),
  secondaryPhone: z.string().trim().min(10).optional(),
  isMinor: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  postalCode: brazilianPostalCode,
  street: z.string().trim().max(200).optional(),
  number: z.string().trim().max(40).optional(),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  country: z.string().trim().max(80).optional(),
}).superRefine((data, ctx) => {
  const country = (data.country ?? 'Brasil').toLowerCase();
  if (data.postalCode && country.includes('brasil') && data.postalCode.length !== 8) {
    ctx.addIssue({ code: 'custom', message: 'CEP inválido para o Brasil.', path: ['postalCode'] });
  }
});

export type CreatePatientInput = {
  fullName: string;
  preferredName?: string;
  cpf?: string;
  passportNumber?: string;
  birthDate?: string;
  email?: string;
  primaryPhone: string;
  secondaryPhone?: string;
  isMinor?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
  clinicId: string;
};

@Injectable()
export class PatientsService {
  async list(
    organizationId: string,
    search?: string,
    clinicId?: string,
    options?: { cursor?: string; take?: number; includeArchived?: boolean; scope?: ClinicScope },
  ) {
    const scope = options?.scope ?? { clinicIds: null };
    if (clinicId) assertClinicInScope(scope, clinicId);
    const paginated = options?.cursor !== undefined || options?.take !== undefined;
    const take = Math.min(Math.max(options?.take ?? (paginated ? 50 : 100), 1), 100);
    const items = await prisma.patient.findMany({
      where: {
        organizationId,
        status: options?.includeArchived ? undefined : { not: 'ARCHIVED' },
        ...(clinicId
          ? { clinics: { some: { clinicId, status: 'ACTIVE' } } }
          : patientClinicFilter(scope)),
        ...(options?.cursor ? { id: { gt: options.cursor } } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' as const } },
                { cpf: { contains: search } },
                { primaryPhone: { contains: search } },
                { secondaryPhone: { contains: search } },
                { passportNumber: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { alerts: { where: { active: true } }, clinics: true },
      orderBy: paginated ? [{ id: 'asc' }] : [{ fullName: 'asc' }],
      take: paginated ? take + 1 : take,
    });
    if (!paginated) return this.withProfilePhotos(organizationId, items);
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return {
      items: await this.withProfilePhotos(organizationId, page),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  private async withProfilePhotos<T extends { id: string }>(organizationId: string, items: T[]) {
    if (!items.length) return items.map((item) => ({ ...item, profilePhotoMediaId: null, profilePhotoUrl: null }));
    const photos = await prisma.patientMedia.findMany({
      where: {
        organizationId,
        patientId: { in: items.map((item) => item.id) },
        type: 'PROFILE_PHOTO',
        archivedAt: null,
      },
      select: { id: true, patientId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const firstByPatient = new Map<string, string>();
    for (const photo of photos) {
      if (!firstByPatient.has(photo.patientId)) firstByPatient.set(photo.patientId, photo.id);
    }
    return items.map((item) => {
      const mediaId = firstByPatient.get(item.id) ?? null;
      return {
        ...item,
        profilePhotoMediaId: mediaId,
        profilePhotoUrl: mediaId ? `/patients/${item.id}/media/${mediaId}/download` : null,
      };
    });
  }

  async find(organizationId: string, id: string, scope?: ClinicScope) {
    const patient = await prisma.patient.findFirst({
      where: {
        id,
        organizationId,
        ...(scope ? patientClinicFilter(scope) : {}),
      },
      include: { guardians: { include: { guardian: true } }, alerts: true, clinics: true },
    });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    return patient;
  }

  async create(organizationId: string, input: CreatePatientInput, scope?: ClinicScope) {
    if (scope) assertClinicInScope(scope, input.clinicId);
    const parsed = parseWithZod(patientDataSchema, input);
    if (parsed.cpf) {
      const duplicate = await prisma.patient.findFirst({ where: { organizationId, cpf: parsed.cpf } });
      if (duplicate) throw new ConflictException('Já existe um paciente com este CPF.');
    }
    if (parsed.passportNumber) {
      const duplicatePassport = await prisma.patient.findFirst({
        where: { organizationId, passportNumber: parsed.passportNumber },
      });
      if (duplicatePassport) throw new ConflictException('Já existe um paciente com este passaporte.');
    }
    return prisma.patient.create({
      data: {
        organizationId,
        fullName: parsed.fullName,
        preferredName: parsed.preferredName,
        cpf: parsed.cpf,
        passportNumber: parsed.passportNumber,
        birthDate: parsed.birthDate ? new Date(`${parsed.birthDate}T00:00:00.000Z`) : undefined,
        email: parsed.email,
        primaryPhone: parsed.primaryPhone,
        secondaryPhone: parsed.secondaryPhone,
        isMinor: parsed.isMinor ?? false,
        status: parsed.status ?? 'ACTIVE',
        postalCode: parsed.postalCode || null,
        street: parsed.street || null,
        number: parsed.number || null,
        complement: parsed.complement || null,
        district: parsed.district || null,
        city: parsed.city || null,
        state: parsed.state || null,
        country: parsed.country || 'Brasil',
        clinics: { create: { clinicId: input.clinicId } },
      },
    });
  }

  async update(organizationId: string, id: string, input: Omit<CreatePatientInput, 'clinicId'>) {
    const data = parseWithZod(patientDataSchema, input);
    const existing = await this.find(organizationId, id);
    if (data.isMinor) {
      const guardianCount = await prisma.patientGuardian.count({ where: { patientId: id } });
      // Permite marcar menor sem guardião ainda — a UI envia o guardião em seguida.
      // Bloqueia apenas se já era menor e ficou sem guardião (desvínculo).
      if (existing.isMinor && guardianCount === 0) {
        throw new BadRequestException('Paciente menor de idade exige ao menos um responsável vinculado.');
      }
    }
    if (data.cpf) {
      const duplicate = await prisma.patient.findFirst({
        where: { organizationId, cpf: data.cpf, id: { not: id } },
      });
      if (duplicate) throw new ConflictException('Já existe um paciente com este CPF.');
    }
    if (data.passportNumber) {
      const duplicatePassport = await prisma.patient.findFirst({
        where: { organizationId, passportNumber: data.passportNumber, id: { not: id } },
      });
      if (duplicatePassport) throw new ConflictException('Já existe um paciente com este passaporte.');
    }
    return prisma.patient.update({
      where: { id },
      data: {
        fullName: data.fullName,
        preferredName: data.preferredName || null,
        cpf: data.cpf || null,
        passportNumber: data.passportNumber || null,
        birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00.000Z`) : null,
        email: data.email || null,
        primaryPhone: data.primaryPhone,
        secondaryPhone: data.secondaryPhone || null,
        isMinor: data.isMinor,
        status: data.status,
        postalCode: data.postalCode || null,
        street: data.street || null,
        number: data.number || null,
        complement: data.complement || null,
        district: data.district || null,
        city: data.city || null,
        state: data.state || null,
        country: data.country || 'Brasil',
      },
    });
  }

  async archive(organizationId: string, id: string) {
    await this.find(organizationId, id);
    return prisma.patient.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async restore(organizationId: string, id: string) {
    const patient = await this.find(organizationId, id);
    if (patient.status !== 'ARCHIVED') throw new ConflictException('Paciente não está arquivado.');
    return prisma.patient.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  async linkClinic(organizationId: string, patientId: string, clinicId: string) {
    await this.find(organizationId, patientId);
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    await prisma.patientClinic.upsert({
      where: { patientId_clinicId: { patientId, clinicId } },
      create: { patientId, clinicId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return this.find(organizationId, patientId);
  }

  addGuardian(organizationId: string, patientId: string, actorId: string, input: Parameters<typeof addPatientGuardian>[3]) {
    return addPatientGuardian(organizationId, patientId, actorId, input);
  }

  updateGuardian(
    organizationId: string,
    patientId: string,
    guardianId: string,
    actorId: string,
    input: Parameters<typeof updatePatientGuardian>[4],
  ) {
    return updatePatientGuardian(organizationId, patientId, guardianId, actorId, input);
  }

  unlinkGuardian(organizationId: string, patientId: string, guardianId: string, actorId: string) {
    return unlinkPatientGuardian(organizationId, patientId, guardianId, actorId);
  }

  createAlert(organizationId: string, patientId: string, actorId: string, input: Parameters<typeof createPatientAlert>[3]) {
    return createPatientAlert(organizationId, patientId, actorId, input);
  }

  updateAlert(
    organizationId: string,
    patientId: string,
    alertId: string,
    actorId: string,
    input: Parameters<typeof updatePatientAlert>[4],
  ) {
    return updatePatientAlert(organizationId, patientId, alertId, actorId, input);
  }

  merge(organizationId: string, actorId: string, targetPatientId: string, sourcePatientId: string) {
    return mergePatients(organizationId, actorId, targetPatientId, sourcePatientId);
  }

  listDuplicates(organizationId: string, clinicId?: string) {
    return listPatientDuplicates(organizationId, clinicId);
  }

  dismissDuplicate(
    organizationId: string,
    actorId: string,
    patientIdA: string,
    patientIdB: string,
    reason?: string,
  ) {
    return dismissPatientDuplicate(organizationId, actorId, patientIdA, patientIdB, reason);
  }

  previewMerge(organizationId: string, targetPatientId: string, sourcePatientId: string) {
    return previewPatientMerge(organizationId, targetPatientId, sourcePatientId);
  }

  listPreferences(organizationId: string, patientId: string) {
    return listCommunicationPreferences(organizationId, patientId);
  }

  upsertPreference(
    organizationId: string,
    patientId: string,
    input: Parameters<typeof upsertCommunicationPreference>[2],
  ) {
    return upsertCommunicationPreference(organizationId, patientId, input);
  }

  async globalSearch(organizationId: string, query: string, clinicId?: string, permissions: string[] = []) {
    const q = query.trim();
    if (q.length < 2) {
      return {
        patients: [], appointments: [], treatments: [], labCases: [], tasks: [],
        documents: [], prescriptions: [],
      };
    }
    const can = (code: string) => permissions.includes(code) || permissions.includes('organization.manage');
    const canClinicalDocs = can('document.view') || can('medical_record.view');
    const [patients, appointments, treatments, labCases, tasks, documents, prescriptions] = await Promise.all([
      can('patient.view')
        ? prisma.patient.findMany({
            where: {
              organizationId,
              status: { not: 'ARCHIVED' },
              clinics: clinicId ? { some: { clinicId } } : undefined,
              OR: [
                { fullName: { contains: q, mode: 'insensitive' } },
                { cpf: { contains: q } },
                { primaryPhone: { contains: q } },
              ],
            },
            select: { id: true, fullName: true, cpf: true, primaryPhone: true, status: true },
            take: 8,
            orderBy: { fullName: 'asc' },
          })
        : Promise.resolve([]),
      can('appointment.view')
        ? prisma.appointment.findMany({
            where: {
              organizationId,
              clinicId,
              OR: [
                { notes: { contains: q, mode: 'insensitive' } },
                { patient: { fullName: { contains: q, mode: 'insensitive' } } },
              ],
            },
            select: {
              id: true,
              status: true,
              startAt: true,
              patient: { select: { id: true, fullName: true } },
            },
            take: 5,
            orderBy: { startAt: 'desc' },
          })
        : Promise.resolve([]),
      can('treatment.view')
        ? prisma.treatmentPlan.findMany({
            where: {
              organizationId,
              clinicId,
              archivedAt: null,
              title: { contains: q, mode: 'insensitive' },
            },
            select: { id: true, title: true, status: true, patientId: true },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      can('lab_case.view')
        ? prisma.labCase.findMany({
            where: {
              organizationId,
              clinicId,
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { laboratoryName: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { id: true, code: true, description: true, status: true, patientId: true },
            take: 5,
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      can('task.view')
        ? prisma.task.findMany({
            where: {
              organizationId,
              clinicId,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { id: true, title: true, status: true },
            take: 5,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      canClinicalDocs
        ? prisma.generatedDocument.findMany({
            where: {
              organizationId,
              ...(clinicId ? { clinicId } : {}),
              OR: [
                { validationCode: { contains: q, mode: 'insensitive' } },
                { template: { name: { contains: q, mode: 'insensitive' } } },
              ],
            },
            select: {
              id: true,
              status: true,
              validationCode: true,
              patientId: true,
              template: { select: { name: true, type: true } },
            },
            take: 5,
            orderBy: { generatedAt: 'desc' },
          })
        : Promise.resolve([]),
      canClinicalDocs
        ? prisma.prescription.findMany({
            where: {
              organizationId,
              ...(clinicId ? { clinicId } : {}),
              OR: [
                { purpose: { contains: q, mode: 'insensitive' } },
                { validationCode: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              purpose: true,
              status: true,
              validationCode: true,
              patientId: true,
              items: true,
            },
            take: 8,
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const documentPatientIds = [...new Set((documents as Array<{ patientId: string }>).map((d) => d.patientId))];
    const prescriptionPatientIds = [...new Set((prescriptions as Array<{ patientId: string }>).map((d) => d.patientId))];
    const nameIds = [...new Set([...documentPatientIds, ...prescriptionPatientIds])];
    const patientNames = nameIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: nameIds }, organizationId },
          select: { id: true, fullName: true },
        })
      : [];
    const nameMap = new Map(patientNames.map((p) => [p.id, p.fullName]));

    // Enrich documents with patient name match on query when possible
    const docsWithNames = (documents as Array<{
      id: string;
      status: string;
      validationCode: string;
      patientId: string;
      template: { name: string; type: string } | null;
    }>).map((doc) => ({
      id: doc.id,
      name: doc.template?.name ?? 'Documento',
      type: doc.template?.type ?? null,
      status: doc.status,
      validationCode: doc.validationCode,
      patientId: doc.patientId,
      patientName: nameMap.get(doc.patientId),
    }));

    // Also match patient name for documents if query looks like a name
    let extraDocs: typeof docsWithNames = [];
    if (canClinicalDocs && docsWithNames.length < 5) {
      const matchedPatients = await prisma.patient.findMany({
        where: {
          organizationId,
          fullName: { contains: q, mode: 'insensitive' },
          clinics: clinicId ? { some: { clinicId } } : undefined,
        },
        select: { id: true, fullName: true },
        take: 5,
      });
      if (matchedPatients.length) {
        const more = await prisma.generatedDocument.findMany({
          where: {
            organizationId,
            ...(clinicId ? { clinicId } : {}),
            patientId: { in: matchedPatients.map((p) => p.id) },
            id: { notIn: docsWithNames.map((d) => d.id) },
          },
          select: {
            id: true,
            status: true,
            validationCode: true,
            patientId: true,
            template: { select: { name: true, type: true } },
          },
          take: 5 - docsWithNames.length,
          orderBy: { generatedAt: 'desc' },
        });
        const pmap = new Map(matchedPatients.map((p) => [p.id, p.fullName]));
        extraDocs = more.map((doc) => ({
          id: doc.id,
          name: doc.template?.name ?? 'Documento',
          type: doc.template?.type ?? null,
          status: doc.status,
          validationCode: doc.validationCode,
          patientId: doc.patientId,
          patientName: pmap.get(doc.patientId),
        }));
      }
    }

    const filteredPrescriptions = (prescriptions as Array<{
      id: string;
      purpose: string;
      status: string;
      validationCode: string | null;
      patientId: string;
      items: unknown;
    }>).filter((row) => {
      if (row.purpose.toLowerCase().includes(q.toLowerCase())) return true;
      if (row.validationCode?.toLowerCase().includes(q.toLowerCase())) return true;
      const items = Array.isArray(row.items) ? row.items : [];
      return items.some((item) => {
        if (!item || typeof item !== 'object') return false;
        const name = String((item as { medicationName?: string }).medicationName ?? '');
        return name.toLowerCase().includes(q.toLowerCase());
      });
    }).slice(0, 5).map(({ items: _items, ...rest }) => ({
      ...rest,
      patientName: nameMap.get(rest.patientId),
    }));

    return {
      patients: await this.withProfilePhotos(organizationId, patients),
      appointments,
      treatments,
      labCases,
      tasks,
      documents: [...docsWithNames, ...extraDocs].slice(0, 5),
      prescriptions: filteredPrescriptions,
    };
  }
}

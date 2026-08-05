import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;
const clinicalEntrySchema = z.object({
  clinicId: z.string().uuid(),
  professionalId: z.string().uuid(),
  type: z.string().min(2),
  renderedText: z.string().trim().min(2),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  clinicalDate: z.string().datetime(),
  appointmentId: z.string().uuid().optional(),
  treatmentId: z.string().uuid().optional(),
});
const odontogramSchema = z.object({
  clinicId: z.string().uuid(),
  professionalId: z.string().uuid(),
  dentitionType: z.enum(['PERMANENT', 'DECIDUOUS']),
  findings: z.array(z.object({
    conditionId: z.string().uuid(),
    toothFdi: z.string().regex(/^[1-8][1-8]$/),
    face: z.string().optional(),
    status: z.enum(['EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED']).optional(),
    notes: z.string().optional(),
  })).min(1),
});

@Injectable()
export class ClinicalService {
  async record(organizationId: string, clinicId: string, patientId: string) {
    await Promise.all([this.assertPatient(organizationId, patientId), this.assertClinic(organizationId, clinicId)]);
    return prisma.clinicalRecord.upsert({
      where: { clinicId_patientId: { clinicId, patientId } },
      create: { organizationId, clinicId, patientId },
      update: {},
      include: {
        entries: { include: { corrections: true }, orderBy: { clinicalDate: 'desc' } },
        privateNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async addEntry(organizationId: string, patientId: string, input: {
    clinicId: string; professionalId: string; type: string; renderedText: string;
    structuredData?: Record<string, unknown>; clinicalDate: string; appointmentId?: string; treatmentId?: string;
  }) {
    parseWithZod(clinicalEntrySchema, input);
    await Promise.all([
      this.assertProfessional(organizationId, input.professionalId),
      input.treatmentId
        ? prisma.treatmentPlan.findFirst({
            where: { id: input.treatmentId, organizationId, patientId },
            select: { id: true },
          }).then((plan) => {
            if (!plan) throw new NotFoundException('Tratamento não encontrado para este paciente.');
          })
        : Promise.resolve(),
    ]);
    const record = await this.record(organizationId, input.clinicId, patientId);
    return prisma.clinicalEntry.create({
      data: {
        clinicalRecordId: record.id,
        professionalId: input.professionalId,
        appointmentId: input.appointmentId,
        treatmentId: input.treatmentId,
        type: input.type,
        renderedText: input.renderedText,
        structuredData: json(input.structuredData ?? {}),
        clinicalDate: new Date(input.clinicalDate),
      },
    });
  }

  async signEntry(organizationId: string, id: string) {
    const entry = await prisma.clinicalEntry.findFirst({
      where: { id, record: { organizationId } },
    });
    if (!entry) throw new NotFoundException('Evolução clínica não encontrada.');
    if (entry.status !== 'DRAFT') throw new ConflictException('A evolução não está disponível para assinatura.');
    const contentHash = sha256({
      renderedText: entry.renderedText,
      structuredData: entry.structuredData,
      clinicalDate: entry.clinicalDate.toISOString(),
    });
    return prisma.clinicalEntry.update({
      where: { id },
      data: { status: 'SIGNED', signedAt: new Date(), contentHash },
    });
  }

  async correctEntry(organizationId: string, id: string, authorId: string, input: {
    reason: string; correctedContent: Record<string, unknown>;
  }) {
    const entry = await prisma.clinicalEntry.findFirst({
      where: { id, record: { organizationId } },
    });
    if (!entry) throw new NotFoundException('Evolução clínica não encontrada.');
    if (entry.status !== 'SIGNED' && entry.status !== 'CORRECTED') {
      throw new ConflictException('Somente registros assinados recebem correções por adendo.');
    }
    return prisma.$transaction(async (tx) => {
      const correction = await tx.clinicalEntryCorrection.create({
        data: {
          clinicalEntryId: id,
          authorId,
          reason: input.reason,
          correctedContent: json(input.correctedContent),
          signatureHash: sha256(input.correctedContent),
        },
      });
      await tx.clinicalEntry.update({ where: { id }, data: { status: 'CORRECTED' } });
      return correction;
    });
  }

  async addPrivateNote(organizationId: string, patientId: string, actorId: string, input: {
    clinicId: string; content: string;
  }) {
    const record = await this.record(organizationId, input.clinicId, patientId);
    return prisma.privateClinicalNote.create({
      data: { clinicalRecordId: record.id, authorId: actorId, content: input.content },
    });
  }

  listAnamnesisTemplates(organizationId: string) {
    return prisma.anamnesisTemplate.findMany({
      where: { organizationId, active: true },
      orderBy: [{ audience: 'asc' }, { version: 'desc' }],
    });
  }

  createAnamnesisTemplate(organizationId: string, input: {
    name: string; audience: string; schemaJson: Record<string, unknown>; validityMonths?: number;
  }) {
    return prisma.anamnesisTemplate.create({
      data: { organizationId, ...input, schemaJson: json(input.schemaJson), validityMonths: input.validityMonths ?? 6 },
    });
  }

  async submitAnamnesis(organizationId: string, patientId: string, actorId: string, input: {
    clinicId: string; templateId: string; answers: Record<string, unknown>;
  }) {
    await this.assertPatient(organizationId, patientId);
    const template = await prisma.anamnesisTemplate.findFirst({
      where: { id: input.templateId, organizationId, active: true },
    });
    if (!template) throw new NotFoundException('Modelo de anamnese não encontrado.');
    const alerts = this.extractAlerts(input.answers);
    const validUntil = new Date();
    validUntil.setUTCMonth(validUntil.getUTCMonth() + template.validityMonths);
    return prisma.$transaction(async (tx) => {
      const response = await tx.anamnesisResponse.create({
        data: {
          organizationId,
          clinicId: input.clinicId,
          patientId,
          templateId: template.id,
          templateVersion: template.version,
          answers: json(input.answers),
          alerts: json(alerts),
          completedById: actorId,
          validUntil,
        },
      });
      for (const alert of alerts) {
        await tx.patientAlert.create({
          data: { patientId, type: alert.type, message: alert.message, severity: 'WARNING' },
        });
      }
      return response;
    });
  }

  async signAnamnesis(organizationId: string, id: string, actorId: string) {
    const response = await prisma.anamnesisResponse.findFirst({ where: { id, organizationId } });
    if (!response) throw new NotFoundException('Anamnese não encontrada.');
    if (response.signedAt) throw new ConflictException('Anamnese já assinada.');
    return prisma.anamnesisResponse.update({
      where: { id },
      data: { signedById: actorId, signedAt: new Date(), contentHash: sha256(response.answers) },
    });
  }

  getOdontograms(organizationId: string, patientId: string) {
    return prisma.odontogram.findMany({
      where: { organizationId, patientId },
      include: { findings: { include: { condition: true } } },
      orderBy: { recordedAt: 'desc' },
    });
  }

  getOdontogramConditions(organizationId: string) {
    return prisma.odontogramCondition.findMany({
      where: { organizationId, active: true },
      select: { id: true, code: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
  }

  async createOdontogram(organizationId: string, patientId: string, input: {
    clinicId: string; professionalId: string; dentitionType: string;
    findings: Array<{ conditionId: string; toothFdi: string; face?: string; status?: 'EXISTING' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'; notes?: string }>;
  }) {
    const parsed = parseWithZod(odontogramSchema, input);
    await Promise.all([
      this.assertPatient(organizationId, patientId),
      this.assertClinic(organizationId, input.clinicId),
      this.assertProfessional(organizationId, input.professionalId),
    ]);
    const conditionCount = await prisma.odontogramCondition.count({
      where: { organizationId, active: true, id: { in: parsed.findings.map((finding) => finding.conditionId) } },
    });
    if (conditionCount !== new Set(parsed.findings.map((finding) => finding.conditionId)).size) {
      throw new NotFoundException('Condição odontológica inválida.');
    }
    const latest = await prisma.odontogram.findFirst({
      where: { organizationId, patientId, dentitionType: input.dentitionType },
      include: { findings: true },
      orderBy: { version: 'desc' },
    });
    const replacements = new Set(input.findings.map((finding) => `${finding.toothFdi}:${finding.face ?? ''}`));
    const findings = [
      ...(latest?.findings ?? [])
        .filter((finding) => !replacements.has(`${finding.toothFdi}:${finding.face ?? ''}`))
        .map(({ conditionId, toothFdi, face, status, notes }) => ({ conditionId, toothFdi, face: face ?? undefined, status, notes: notes ?? undefined })),
      ...input.findings,
    ];
    return prisma.odontogram.create({
      data: {
        organizationId,
        patientId,
        clinicId: input.clinicId,
        professionalId: input.professionalId,
        dentitionType: input.dentitionType,
        version: (latest?.version ?? 0) + 1,
        findings: { create: findings },
      },
      include: { findings: { include: { condition: true } } },
    });
  }

  private async assertPatient(organizationId: string, patientId: string) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
  }

  private async assertClinic(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId, status: 'ACTIVE' } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }

  private async assertProfessional(organizationId: string, professionalId: string) {
    const professional = await prisma.professional.findFirst({
      where: { id: professionalId, user: { organizationId }, status: 'ACTIVE' },
    });
    if (!professional) throw new NotFoundException('Profissional não encontrado.');
  }

  private extractAlerts(answers: Record<string, unknown>) {
    const alertKeys = ['allergies', 'alergias', 'pregnancy', 'gestante', 'medications', 'medicamentos'];
    return alertKeys.flatMap((key) => {
      const value = answers[key];
      if (!value || value === false || value === 'não') return [];
      return [{ type: key.toUpperCase(), message: `${key}: ${String(value)}` }];
    });
  }
}

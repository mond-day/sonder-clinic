import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { createAntivirusScanner, createStorageAdapter } from '@sonder/storage';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const clinicalEntrySchema = z.object({
  clinicId: z.string().uuid(),
  professionalId: z.string().uuid(),
  type: z.string().min(2),
  renderedText: z.string().trim().min(2),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  clinicalDate: z.string().datetime().or(z.string().min(8)),
  appointmentId: z.string().uuid().optional(),
  treatmentId: z.string().uuid().optional(),
  treatmentItemId: z.string().uuid().optional(),
  treatmentSessionId: z.string().uuid().optional(),
  toothFdi: z.string().optional(),
  region: z.string().optional(),
});

const odontogramSchema = z.object({
  clinicId: z.string().uuid(),
  professionalId: z.string().uuid(),
  dentitionType: z.enum(['PERMANENT', 'DECIDUOUS', 'MIXED']),
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
  private readonly storage = createStorageAdapter();
  private readonly antivirus = createAntivirusScanner();

  async record(organizationId: string, clinicId: string, patientId: string) {
    await Promise.all([this.assertPatient(organizationId, patientId), this.assertClinic(organizationId, clinicId)]);
    return prisma.clinicalRecord.upsert({
      where: { clinicId_patientId: { clinicId, patientId } },
      create: { organizationId, clinicId, patientId },
      update: {},
      include: {
        entries: {
          include: { corrections: true, attachments: true },
          orderBy: { clinicalDate: 'desc' },
        },
        privateNotes: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async listEntries(organizationId: string, patientId: string, filters: {
    clinicId?: string; type?: string; status?: string; professionalId?: string;
    from?: string; to?: string; treatmentId?: string; toothFdi?: string;
  }) {
    await this.assertPatient(organizationId, patientId);
    return prisma.clinicalEntry.findMany({
      where: {
        record: {
          organizationId,
          patientId,
          ...(filters.clinicId ? { clinicId: filters.clinicId } : {}),
        },
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
        ...(filters.professionalId ? { professionalId: filters.professionalId } : {}),
        ...(filters.treatmentId ? { treatmentId: filters.treatmentId } : {}),
        ...(filters.toothFdi ? { toothFdi: filters.toothFdi } : {}),
        ...(filters.from || filters.to
          ? {
              clinicalDate: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      include: { corrections: true, attachments: true },
      orderBy: { clinicalDate: 'desc' },
    });
  }

  async getEntry(organizationId: string, id: string) {
    const entry = await prisma.clinicalEntry.findFirst({
      where: { id, record: { organizationId } },
      include: {
        corrections: { orderBy: { createdAt: 'asc' } },
        attachments: true,
        record: { select: { patientId: true, clinicId: true } },
      },
    });
    if (!entry) throw new NotFoundException('Evolução clínica não encontrada.');
    return entry;
  }

  async addEntry(organizationId: string, patientId: string, input: z.infer<typeof clinicalEntrySchema>) {
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
        treatmentItemId: input.treatmentItemId,
        treatmentSessionId: input.treatmentSessionId,
        toothFdi: input.toothFdi,
        region: input.region,
        type: input.type,
        renderedText: input.renderedText,
        structuredData: json(input.structuredData ?? { schemaVersion: 1 }),
        clinicalDate: new Date(input.clinicalDate),
      },
      include: { corrections: true, attachments: true },
    });
  }

  async updateDraft(organizationId: string, id: string, input: {
    renderedText?: string; structuredData?: Record<string, unknown>; clinicalDate?: string;
    type?: string; appointmentId?: string; treatmentId?: string; treatmentItemId?: string;
    treatmentSessionId?: string; toothFdi?: string; region?: string;
  }) {
    const entry = await this.getEntry(organizationId, id);
    if (entry.status !== 'DRAFT') throw new ConflictException('Somente rascunhos podem ser editados.');
    return prisma.clinicalEntry.update({
      where: { id },
      data: {
        renderedText: input.renderedText,
        structuredData: input.structuredData ? json(input.structuredData) : undefined,
        clinicalDate: input.clinicalDate ? new Date(input.clinicalDate) : undefined,
        type: input.type,
        appointmentId: input.appointmentId,
        treatmentId: input.treatmentId,
        treatmentItemId: input.treatmentItemId,
        treatmentSessionId: input.treatmentSessionId,
        toothFdi: input.toothFdi,
        region: input.region,
      },
      include: { corrections: true, attachments: true },
    });
  }

  async addAttachment(organizationId: string, id: string, input: { patientMediaId: string; label?: string }) {
    const entry = await this.getEntry(organizationId, id);
    if (entry.status !== 'DRAFT') throw new ConflictException('Anexos só podem ser adicionados em rascunho.');
    const media = await prisma.patientMedia.findFirst({
      where: { id: input.patientMediaId, organizationId, patientId: entry.record.patientId },
    });
    if (!media) throw new NotFoundException('Mídia do paciente não encontrada.');
    return prisma.clinicalEntryAttachment.create({
      data: {
        clinicalEntryId: id,
        patientMediaId: input.patientMediaId,
        label: input.label,
      },
    });
  }

  async removeAttachment(organizationId: string, id: string, attachmentId: string) {
    const entry = await this.getEntry(organizationId, id);
    if (entry.status !== 'DRAFT') throw new ConflictException('Anexos só podem ser removidos em rascunho.');
    const attachment = await prisma.clinicalEntryAttachment.findFirst({
      where: { id: attachmentId, clinicalEntryId: id },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');
    await prisma.clinicalEntryAttachment.delete({ where: { id: attachmentId } });
    return { ok: true };
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
      toothFdi: entry.toothFdi,
      region: entry.region,
    });
    return prisma.clinicalEntry.update({
      where: { id },
      data: { status: 'SIGNED', signedAt: new Date(), contentHash },
      include: { corrections: true, attachments: true },
    });
  }

  async correctEntry(organizationId: string, id: string, authorId: string, input: {
    reason: string; correctedContent: Record<string, unknown>; renderedText?: string; kind?: 'ADDENDUM' | 'CORRECTION';
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
          kind: input.kind ?? 'ADDENDUM',
          reason: input.reason,
          renderedText: input.renderedText,
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
        .map(({ conditionId, toothFdi, face, status, notes }) => ({
          conditionId, toothFdi, face: face ?? undefined, status, notes: notes ?? undefined,
        })),
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

  async listPatientMedia(organizationId: string, patientId: string) {
    await this.assertPatient(organizationId, patientId);
    return prisma.patientMedia.findMany({
      where: { organizationId, patientId },
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            antivirusStatus: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async uploadPatientMedia(
    organizationId: string,
    patientId: string,
    actorId: string,
    input: {
      clinicId: string;
      type: string;
      toothFdi?: string;
      appointmentId?: string;
      treatmentId?: string;
      examDate?: string;
      notes?: string;
      file: { originalname: string; size: number; buffer: Buffer; mimetype: string };
    },
  ) {
    await Promise.all([
      this.assertPatient(organizationId, patientId),
      this.assertClinic(organizationId, input.clinicId),
    ]);
    if (!this.storage.enabled) {
      throw new BadRequestException(
        this.storage.disabledReason
          ?? 'Storage desabilitado — configure STORAGE_DRIVER=local ou MinIO/S3 com credenciais.',
      );
    }
    const file = input.file;
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    if (file.size > MAX_MEDIA_BYTES) throw new BadRequestException('Arquivo deve ter no máximo 25 MB.');
    const extension = file.originalname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
    const scan = await this.antivirus.scan(file.buffer);
    if (scan.infected) {
      throw new BadRequestException(
        `Arquivo rejeitado pelo antivírus${scan.detail ? `: ${scan.detail}` : '.'}`,
      );
    }
    // Sem ClamAV ativo / daemon offline → PENDING (nunca CLEAN falso).
    const antivirusStatus = scan.clean ? 'CLEAN' : 'PENDING';
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    let stored;
    try {
      stored = await this.storage.putObject({
        organizationId,
        clinicId: input.clinicId,
        filename: file.originalname,
        contentType: file.mimetype || 'application/octet-stream',
        body: file.buffer,
        keyPrefix: 'patient-media',
        metadata: { kind: 'patient-media', patientId, type: input.type },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao gravar no storage.';
      throw new BadRequestException(detail);
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const fileObject = await tx.fileObject.create({
          data: {
            organizationId,
            bucket: stored.bucket,
            objectKey: stored.objectKey,
            originalName: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            extension: extension || null,
            sizeBytes: BigInt(file.size),
            checksum,
            status: 'AVAILABLE',
            antivirusStatus,
            createdById: actorId,
            metadata: json({
              kind: 'patient-media',
              patientId,
              type: input.type,
              scanDetail: scan.detail ?? null,
              scanEngine: scan.engine,
            }),
          },
        });
        return tx.patientMedia.create({
          data: {
            organizationId,
            patientId,
            fileId: fileObject.id,
            type: input.type,
            toothFdi: input.toothFdi,
            appointmentId: input.appointmentId,
            treatmentId: input.treatmentId,
            examDate: input.examDate ? new Date(`${input.examDate}T00:00:00Z`) : undefined,
            notes: input.notes,
          },
          include: {
            file: {
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                status: true,
                antivirusStatus: true,
                createdAt: true,
              },
            },
          },
        });
      });
    } catch (error) {
      await this.storage.deleteObject(stored.objectKey).catch(() => undefined);
      throw error;
    }
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
}

import {
  BadRequestException, ConflictException, GoneException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';
import { buildAnamnesisContentHash } from './anamnesis-hash';
import {
  calculateAlertsAndRisk, parseAnamnesisSchema, validateAnswers,
} from './anamnesis-schema';
import { effectiveAnamnesisStatus, withEffectiveStatus } from './anamnesis-status';
import { assertOriginStillReplaceable, canCreateUpdateFrom } from './anamnesis-lifecycle';

const tokenSha256 = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;

const templateInputSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  audience: z.enum(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT', 'CUSTOM']),
  schemaJson: z.record(z.string(), z.unknown()),
  validityMonths: z.number().int().min(1).max(36).optional(),
});

type AuditAction =
  | 'anamnesis.created'
  | 'anamnesis.draft_updated'
  | 'anamnesis.signature_requested'
  | 'anamnesis.signature_request_revoked'
  | 'anamnesis.signed'
  | 'anamnesis.reopened'
  | 'anamnesis.update_draft_created'
  | 'anamnesis.superseded'
  | 'anamnesis.cancelled'
  | 'anamnesis.draft_deleted';

@Injectable()
export class AnamnesisService {
  private async assertClinic(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada nesta organização.');
    return clinic;
  }

  private async assertPatient(organizationId: string, patientId: string) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    return patient;
  }

  private async audit(
    tx: Prisma.TransactionClient | typeof prisma,
    input: {
      actorId?: string | null;
      action: AuditAction;
      clinicId?: string | null;
      entityId: string;
      changes: Record<string, unknown>;
    },
  ) {
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: 'AnamnesisResponse',
        entityId: input.entityId,
        clinicId: input.clinicId ?? null,
        changes: json(input.changes),
        correlationId: randomUUID(),
      },
    });
  }

  private contentHashFor(response: {
    answers: unknown;
    templateId: string;
    templateVersion: number;
    patientId: string;
    clinicId: string;
  }, answers?: Record<string, unknown>) {
    return buildAnamnesisContentHash({
      answers: (answers ?? response.answers ?? {}) as Record<string, unknown>,
      templateId: response.templateId,
      templateVersion: response.templateVersion,
      patientId: response.patientId,
      clinicId: response.clinicId,
    });
  }

  listTemplates(organizationId: string, query?: {
    audience?: string; status?: string; includeArchived?: boolean; q?: string;
  }) {
    return prisma.anamnesisTemplate.findMany({
      where: {
        organizationId,
        ...(query?.audience ? { audience: query.audience } : {}),
        ...(query?.status ? { status: query.status as never } : {}),
        ...(query?.includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
        ...(query?.q
          ? { name: { contains: query.q, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ audience: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    });
  }

  async getTemplate(organizationId: string, id: string) {
    const template = await prisma.anamnesisTemplate.findFirst({ where: { id, organizationId } });
    if (!template) throw new NotFoundException('Modelo de anamnese não encontrado.');
    return template;
  }

  async createTemplate(organizationId: string, actorId: string, input: z.infer<typeof templateInputSchema>) {
    const parsed = parseWithZod(templateInputSchema, input);
    const schema = parseAnamnesisSchema(parsed.schemaJson);
    return prisma.anamnesisTemplate.create({
      data: {
        organizationId,
        name: parsed.name,
        description: parsed.description,
        audience: parsed.audience,
        schemaJson: json(schema),
        validityMonths: parsed.validityMonths ?? 6,
        status: 'DRAFT',
        createdById: actorId,
      },
    });
  }

  async updateTemplate(organizationId: string, id: string, input: Partial<z.infer<typeof templateInputSchema>>) {
    const template = await this.getTemplate(organizationId, id);
    if (template.status !== 'DRAFT') {
      throw new ConflictException('Somente rascunhos podem ser editados. Crie uma nova versão.');
    }
    const schemaJson = input.schemaJson ? parseAnamnesisSchema(input.schemaJson) : undefined;
    return prisma.anamnesisTemplate.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        audience: input.audience,
        validityMonths: input.validityMonths,
        ...(schemaJson ? { schemaJson: json(schemaJson) } : {}),
      },
    });
  }

  async duplicateTemplate(organizationId: string, id: string, actorId: string) {
    const template = await this.getTemplate(organizationId, id);
    return prisma.anamnesisTemplate.create({
      data: {
        organizationId,
        name: `${template.name} (cópia)`,
        description: template.description,
        audience: template.audience,
        version: 1,
        status: 'DRAFT',
        schemaJson: json(template.schemaJson),
        validityMonths: template.validityMonths,
        sourceTemplateId: template.id,
        createdById: actorId,
        isSystemDefault: false,
      },
    });
  }

  async publishTemplate(organizationId: string, id: string, actorId: string) {
    const template = await this.getTemplate(organizationId, id);
    if (template.status !== 'DRAFT') throw new ConflictException('Somente rascunhos podem ser publicados.');
    parseAnamnesisSchema(template.schemaJson);
    return prisma.anamnesisTemplate.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: actorId,
        active: true,
      },
    });
  }

  async archiveTemplate(organizationId: string, id: string) {
    await this.getTemplate(organizationId, id);
    return prisma.anamnesisTemplate.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), active: false },
    });
  }

  async newVersion(organizationId: string, id: string, actorId: string) {
    const template = await this.getTemplate(organizationId, id);
    if (template.status !== 'PUBLISHED') {
      throw new ConflictException('Nova versão só pode ser criada a partir de um modelo publicado.');
    }
    const latest = await prisma.anamnesisTemplate.findFirst({
      where: { organizationId, name: template.name },
      orderBy: { version: 'desc' },
    });
    return prisma.anamnesisTemplate.create({
      data: {
        organizationId,
        name: template.name,
        description: template.description,
        audience: template.audience,
        version: (latest?.version ?? template.version) + 1,
        status: 'DRAFT',
        schemaJson: json(template.schemaJson),
        validityMonths: template.validityMonths,
        sourceTemplateId: template.id,
        createdById: actorId,
        isSystemDefault: false,
      },
    });
  }

  validateTemplate(organizationId: string, id: string) {
    return this.getTemplate(organizationId, id).then((template) => {
      const schema = parseAnamnesisSchema(template.schemaJson);
      const questionCount = schema.sections.reduce((acc, section) => acc + section.questions.length, 0);
      return { valid: true, questionCount, sections: schema.sections.length, audience: schema.audience };
    });
  }

  async listPatientResponses(organizationId: string, patientId: string, clinicId?: string) {
    await this.assertPatient(organizationId, patientId);
    if (clinicId) await this.assertClinic(organizationId, clinicId);
    const rows = await prisma.anamnesisResponse.findMany({
      where: {
        organizationId,
        patientId,
        ...(clinicId ? { clinicId } : {}),
      },
      include: {
        template: { select: { id: true, name: true, audience: true, version: true } },
        signatures: true,
        signatureRequests: {
          where: { revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => withEffectiveStatus(row));
  }

  async patientSummary(organizationId: string, patientId: string) {
    await this.assertPatient(organizationId, patientId);
    const rows = await prisma.anamnesisResponse.findMany({
      where: { organizationId, patientId },
      select: { status: true, validUntil: true },
    });
    const now = new Date();
    let vigente = 0;
    let drafts = 0;
    let nextReview: Date | null = null;
    for (const row of rows) {
      const effective = effectiveAnamnesisStatus(row, now);
      if (effective === 'DRAFT') drafts += 1;
      if (effective === 'SIGNED') {
        vigente += 1;
        if (row.validUntil) {
          const until = row.validUntil instanceof Date ? row.validUntil : new Date(row.validUntil);
          if (!nextReview || until < nextReview) nextReview = until;
        }
      }
    }
    return {
      vigente,
      drafts,
      nextReview: nextReview?.toISOString() ?? null,
    };
  }

  async getResponse(organizationId: string, id: string) {
    const response = await prisma.anamnesisResponse.findFirst({
      where: { id, organizationId },
      include: {
        template: true,
        signatures: { orderBy: { signedAt: 'asc' } },
        signatureRequests: { orderBy: { createdAt: 'desc' } },
        clinic: { select: { id: true, tradeName: true, legalName: true } },
        patient: { select: { id: true, fullName: true, birthDate: true } },
      },
    });
    if (!response) throw new NotFoundException('Anamnese não encontrada.');
    return withEffectiveStatus(response);
  }

  async createDraft(organizationId: string, patientId: string, actorId: string, input: {
    clinicId: string; templateId: string; answers?: Record<string, unknown>;
  }) {
    await Promise.all([
      this.assertPatient(organizationId, patientId),
      this.assertClinic(organizationId, input.clinicId),
    ]);
    const template = await prisma.anamnesisTemplate.findFirst({
      where: { id: input.templateId, organizationId, status: 'PUBLISHED', active: true },
    });
    if (!template) throw new NotFoundException('Modelo publicado não encontrado.');
    const schema = parseAnamnesisSchema(template.schemaJson);
    const answers = input.answers ?? {};
    const { cleaned } = validateAnswers(schema, answers);
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    const created = await prisma.anamnesisResponse.create({
      data: {
        organizationId,
        clinicId: input.clinicId,
        patientId,
        templateId: template.id,
        templateVersion: template.version,
        status: 'DRAFT',
        answers: json(cleaned),
        alerts: json(alerts),
        riskAssessment: json(riskAssessment),
        completedById: actorId,
      },
    });
    await this.audit(prisma, {
      actorId,
      action: 'anamnesis.created',
      clinicId: input.clinicId,
      entityId: created.id,
      changes: {
        patientId,
        clinicId: input.clinicId,
        templateId: template.id,
        templateVersion: template.version,
        nextStatus: 'DRAFT',
      },
    });
    return created;
  }

  async saveDraft(organizationId: string, id: string, actorId: string, answers: Record<string, unknown>) {
    const response = await this.getResponse(organizationId, id);
    if (response.status === 'AWAITING_SIGNATURE') {
      throw new ConflictException(
        'A anamnese possui uma solicitação de assinatura ativa. Revogue a solicitação para voltar à edição.',
      );
    }
    if (response.status !== 'DRAFT') {
      throw new ConflictException('Anamnese finalizada não pode ser alterada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const { cleaned } = validateAnswers(schema, answers);
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    const updated = await prisma.anamnesisResponse.update({
      where: { id },
      data: {
        answers: json(cleaned),
        alerts: json(alerts),
        riskAssessment: json(riskAssessment),
      },
    });
    await this.audit(prisma, {
      actorId,
      action: 'anamnesis.draft_updated',
      clinicId: response.clinicId,
      entityId: id,
      changes: {
        patientId: response.patientId,
        clinicId: response.clinicId,
        templateId: response.templateId,
        templateVersion: response.templateVersion,
        contentHash: this.contentHashFor(response, cleaned),
      },
    });
    return updated;
  }

  async recalculate(organizationId: string, id: string) {
    const response = await this.getResponse(organizationId, id);
    if (response.status !== 'DRAFT') {
      throw new ConflictException('Recálculo só é permitido em rascunhos.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const answers = (response.answers ?? {}) as Record<string, unknown>;
    const { cleaned } = validateAnswers(schema, answers);
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    return prisma.anamnesisResponse.update({
      where: { id },
      data: {
        answers: json(cleaned),
        alerts: json(alerts),
        riskAssessment: json(riskAssessment),
      },
    });
  }

  async deleteDraft(organizationId: string, id: string, actorId: string) {
    const response = await this.getResponse(organizationId, id);
    if (response.status !== 'DRAFT') {
      throw new ConflictException('Somente rascunhos podem ser excluídos.');
    }
    if (response.signatures.length > 0) {
      throw new ConflictException('Rascunho com assinaturas não pode ser excluído.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.anamnesisSignatureRequest.deleteMany({ where: { anamnesisResponseId: id } });
      await tx.anamnesisResponse.delete({ where: { id } });
      await this.audit(tx, {
        actorId,
        action: 'anamnesis.draft_deleted',
        clinicId: response.clinicId,
        entityId: id,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          templateId: response.templateId,
          previousStatus: 'DRAFT',
        },
      });
    });
    return { ok: true, id };
  }

  /**
   * Reabre para edição apenas AWAITING_SIGNATURE sem assinaturas consumadas.
   * Se já houver assinatura: cancelar ou criar atualização.
   */
  async reopenDraft(organizationId: string, id: string, actorId: string) {
    const response = await this.getResponse(organizationId, id);
    if (response.status === 'SIGNED' || response.status === 'EXPIRED'
      || response.status === 'CANCELLED' || response.status === 'SUPERSEDED') {
      throw new ConflictException(
        'Anamnese já assinada não pode ser reaberta. Cancele ou crie uma atualização.',
      );
    }
    if (response.status !== 'AWAITING_SIGNATURE') {
      throw new ConflictException('Somente anamneses aguardando assinatura podem ser reabertas.');
    }
    if (response.signatures.length > 0) {
      throw new ConflictException(
        'Já existem assinaturas nesta anamnese. Cancele ou crie uma atualização em vez de reabrir.',
      );
    }
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.anamnesisSignatureRequest.updateMany({
        where: { anamnesisResponseId: id, revokedAt: null, usedAt: null },
        data: { revokedAt: now },
      });
      const updated = await tx.anamnesisResponse.update({
        where: { id },
        data: { status: 'DRAFT' },
      });
      await this.audit(tx, {
        actorId,
        action: 'anamnesis.reopened',
        clinicId: response.clinicId,
        entityId: id,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          previousStatus: 'AWAITING_SIGNATURE',
          nextStatus: 'DRAFT',
        },
      });
      return updated;
    });
    return result;
  }

  async requestSignature(organizationId: string, id: string, actorId: string, input: {
    signerRole: 'PATIENT' | 'GUARDIAN' | 'PROFESSIONAL';
    signerName: string;
    expiresInHours?: number;
  }) {
    const response = await this.getResponse(organizationId, id);
    if (['SIGNED', 'SUPERSEDED', 'CANCELLED', 'EXPIRED'].includes(response.status)) {
      throw new ConflictException('Anamnese já finalizada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const { errors } = validateAnswers(schema, (response.answers ?? {}) as Record<string, unknown>);
    if (errors.length) throw new BadRequestException({ message: 'Anamnese incompleta.', errors });
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000);
    const contentHash = this.contentHashFor(response);
    const request = await prisma.$transaction(async (tx) => {
      await tx.anamnesisResponse.update({
        where: { id },
        data: { status: 'AWAITING_SIGNATURE' },
      });
      const created = await tx.anamnesisSignatureRequest.create({
        data: {
          anamnesisResponseId: id,
          tokenHash: tokenSha256(token),
          signerRole: input.signerRole,
          signerName: input.signerName,
          expiresAt,
        },
      });
      await this.audit(tx, {
        actorId,
        action: 'anamnesis.signature_requested',
        clinicId: response.clinicId,
        entityId: id,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          requestId: created.id,
          signerRole: input.signerRole,
          contentHash,
          previousStatus: response.status,
          nextStatus: 'AWAITING_SIGNATURE',
        },
      });
      return created;
    });
    return {
      requestId: request.id,
      token,
      expiresAt,
      publicPath: `/assinar/anamnese/${token}`,
    };
  }

  async revokeSignatureRequest(
    organizationId: string,
    responseId: string,
    requestId: string,
    actorId: string,
  ) {
    const response = await this.getResponse(organizationId, responseId);
    const request = await prisma.anamnesisSignatureRequest.findFirst({
      where: { id: requestId, anamnesisResponseId: responseId },
    });
    if (!request) throw new NotFoundException('Solicitação de assinatura não encontrada.');
    if (request.usedAt) {
      throw new ConflictException('A solicitação já foi utilizada.');
    }
    if (request.revokedAt) {
      return { ok: true, requestId: request.id, revokedAt: request.revokedAt };
    }
    const revokedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.anamnesisSignatureRequest.update({
        where: { id: request.id },
        data: { revokedAt },
      });
      await this.audit(tx, {
        actorId,
        action: 'anamnesis.signature_request_revoked',
        clinicId: response.clinicId,
        entityId: responseId,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          requestId,
        },
      });
    });
    return { ok: true, requestId, revokedAt };
  }

  async sign(organizationId: string, id: string, actorId: string, input: {
    signerName: string;
    signerRole: 'PATIENT' | 'GUARDIAN' | 'PROFESSIONAL';
    method: 'DRAWN' | 'REMOTE_LINK' | 'A1';
    evidence?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const response = await this.getResponse(organizationId, id);
    if (['SIGNED', 'SUPERSEDED', 'CANCELLED', 'EXPIRED'].includes(response.status)) {
      throw new ConflictException('Anamnese já finalizada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const answers = (response.answers ?? {}) as Record<string, unknown>;
    const { errors, cleaned } = validateAnswers(schema, answers);
    if (errors.length) throw new BadRequestException({ message: 'Anamnese incompleta.', errors });
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    const currentContentHash = this.contentHashFor(response, cleaned);
    const validUntil = new Date();
    validUntil.setUTCMonth(validUntil.getUTCMonth() + response.template.validityMonths);

    return prisma.$transaction(async (tx) => {
      await tx.anamnesisSignature.create({
        data: {
          anamnesisResponseId: id,
          signerId: actorId,
          signerName: input.signerName,
          signerRole: input.signerRole,
          method: input.method,
          evidence: json(input.evidence ?? {}),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          signedHash: currentContentHash,
        },
      });
      const signatures = await tx.anamnesisSignature.findMany({ where: { anamnesisResponseId: id } });
      const valid = signatures.filter((signature) => signature.signedHash === currentContentHash);
      const hasPatientOrGuardian = valid.some(
        (s) => s.signerRole === 'PATIENT' || s.signerRole === 'GUARDIAN',
      );
      const hasProfessional = valid.some((s) => s.signerRole === 'PROFESSIONAL');
      const finalize = hasPatientOrGuardian && hasProfessional;

      if (finalize) {
        for (const alert of alerts.filter((item) => item.createPatientAlert)) {
          await tx.patientAlert.create({
            data: {
              patientId: response.patientId,
              type: alert.type,
              message: alert.message,
              severity: alert.severity,
            },
          });
        }

        if (response.sourceResponseId) {
          const origin = await tx.anamnesisResponse.findFirst({
            where: { id: response.sourceResponseId, organizationId },
          });
          if (!origin) {
            throw new ConflictException('Anamnese de origem da atualização não encontrada.');
          }
          if (origin.organizationId !== organizationId) {
            throw new ConflictException('Origem fora do tenant.');
          }
          try {
            assertOriginStillReplaceable({
              id: origin.id,
              status: origin.status,
              supersededById: origin.supersededById,
              organizationId: origin.organizationId,
            }, id);
          } catch {
            throw new ConflictException(
              'Esta origem já foi substituída por outra versão. Conflito de concorrência.',
            );
          }
          const locked = await tx.anamnesisResponse.updateMany({
            where: {
              id: origin.id,
              organizationId,
              OR: [
                { supersededById: null },
                { supersededById: id },
              ],
              status: { not: 'SUPERSEDED' },
            },
            data: {
              status: 'SUPERSEDED',
              supersededById: id,
            },
          });
          if (locked.count !== 1) {
            throw new ConflictException(
              'Esta origem já foi substituída por outra versão. Conflito de concorrência.',
            );
          }
          await this.audit(tx, {
            actorId,
            action: 'anamnesis.superseded',
            clinicId: response.clinicId,
            entityId: origin.id,
            changes: {
              patientId: response.patientId,
              clinicId: response.clinicId,
              previousStatus: origin.status,
              nextStatus: 'SUPERSEDED',
              supersededById: id,
              signaturesPreserved: true,
            },
          });
        }
      }

      const updated = await tx.anamnesisResponse.update({
        where: { id },
        data: {
          answers: json(cleaned),
          alerts: json(alerts),
          riskAssessment: json(riskAssessment),
          status: finalize ? 'SIGNED' : 'AWAITING_SIGNATURE',
          completedAt: finalize ? new Date() : null,
          signedById: finalize ? actorId : response.signedById,
          signedAt: finalize ? new Date() : response.signedAt,
          validUntil: finalize ? validUntil : response.validUntil,
          contentHash: finalize ? currentContentHash : response.contentHash,
        },
        include: { signatures: true, template: true },
      });

      await this.audit(tx, {
        actorId,
        action: 'anamnesis.signed',
        clinicId: response.clinicId,
        entityId: id,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          templateId: response.templateId,
          templateVersion: response.templateVersion,
          contentHash: currentContentHash,
          signerRole: input.signerRole,
          previousStatus: response.status,
          nextStatus: updated.status,
          finalized: finalize,
          sourceResponseId: response.sourceResponseId ?? null,
        },
      });

      return withEffectiveStatus(updated);
    });
  }

  /**
   * Atualização clínica: cria DRAFT referenciando a origem via sourceResponseId.
   * A origem permanece SIGNED/EXPIRED até a nova versão ser finalizada (aí vira SUPERSEDED).
   */
  async supersede(organizationId: string, id: string, actorId: string, clinicId: string) {
    await this.assertClinic(organizationId, clinicId);
    const response = await this.getResponse(organizationId, id);
    const effective = effectiveAnamnesisStatus(response);
    if (!canCreateUpdateFrom(response.status, effective)) {
      throw new ConflictException('Somente anamneses assinadas/expiradas podem ser atualizadas.');
    }
    if (response.supersededById) {
      throw new ConflictException('Esta anamnese já foi substituída por outra versão.');
    }
    return prisma.$transaction(async (tx) => {
      const template = await tx.anamnesisTemplate.findFirst({
        where: { id: response.templateId, organizationId, status: 'PUBLISHED', active: true },
      });
      if (!template) throw new NotFoundException('Modelo publicado não encontrado.');
      const schema = parseAnamnesisSchema(template.schemaJson);
      const answers = (response.answers ?? {}) as Record<string, unknown>;
      const { cleaned } = validateAnswers(schema, answers);
      const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);

      const draft = await tx.anamnesisResponse.create({
        data: {
          organizationId,
          clinicId,
          patientId: response.patientId,
          templateId: template.id,
          templateVersion: template.version,
          status: 'DRAFT',
          answers: json(cleaned),
          alerts: json(alerts),
          riskAssessment: json(riskAssessment),
          completedById: actorId,
          sourceResponseId: id,
        },
      });

      await this.audit(tx, {
        actorId,
        action: 'anamnesis.update_draft_created',
        clinicId,
        entityId: draft.id,
        changes: {
          patientId: response.patientId,
          clinicId,
          templateId: template.id,
          sourceResponseId: id,
          sourceStatus: response.status,
          nextStatus: 'DRAFT',
        },
      });

      return draft;
    });
  }

  async cancel(organizationId: string, id: string, actorId: string, reason?: string) {
    const response = await this.getResponse(organizationId, id);
    if (['CANCELLED', 'SUPERSEDED', 'DRAFT'].includes(response.status)) {
      throw new ConflictException('Esta anamnese não pode ser cancelada neste status.');
    }
    const trimmed = String(reason ?? '').trim();
    if (trimmed.length < 3) {
      throw new BadRequestException('Informe o motivo do cancelamento (mínimo 3 caracteres).');
    }
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      await tx.anamnesisSignatureRequest.updateMany({
        where: { anamnesisResponseId: id, revokedAt: null, usedAt: null },
        data: { revokedAt: now },
      });
      const updated = await tx.anamnesisResponse.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { signatures: true, template: true },
      });
      await this.audit(tx, {
        actorId,
        action: 'anamnesis.cancelled',
        clinicId: response.clinicId,
        entityId: id,
        changes: {
          patientId: response.patientId,
          clinicId: response.clinicId,
          previousStatus: response.status,
          nextStatus: 'CANCELLED',
          reason: trimmed,
          signaturesPreserved: true,
          wasSigned: Boolean(response.signedAt) || response.signatures.length > 0,
        },
      });
      return withEffectiveStatus(updated);
    });
  }

  private async resolvePublicRequest(token: string) {
    const request = await prisma.anamnesisSignatureRequest.findFirst({
      where: { tokenHash: tokenSha256(token) },
      include: {
        response: {
          include: {
            template: { select: { name: true, audience: true, version: true, schemaJson: true } },
            patient: { select: { id: true, fullName: true } },
            signatures: { select: { signerRole: true, signedAt: true, signerName: true } },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Link de assinatura inválido.');
    }
    if (request.revokedAt) {
      throw new GoneException('Link de assinatura revogado.');
    }
    if (request.usedAt) {
      throw new GoneException('Link de assinatura já utilizado.');
    }
    if (request.expiresAt < new Date()) {
      throw new GoneException('Link de assinatura expirado.');
    }
    return request;
  }

  async getPublicSignature(token: string) {
    const request = await this.resolvePublicRequest(token);
    const clinic = await prisma.clinic.findFirst({
      where: { id: request.response.clinicId },
      select: { tradeName: true, legalName: true },
    });
    return {
      signerName: request.signerName,
      signerRole: request.signerRole,
      expiresAt: request.expiresAt,
      clinic,
      patient: request.response.patient,
      template: {
        name: request.response.template.name,
        audience: request.response.template.audience,
        version: request.response.template.version,
        schemaJson: request.response.template.schemaJson,
      },
      answers: request.response.answers,
      signatures: request.response.signatures,
      responseId: request.response.id,
      status: request.response.status,
    };
  }

  async signPublic(token: string, input: {
    evidence?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const request = await this.resolvePublicRequest(token);
    const response = request.response;
    const signed = await this.sign(response.organizationId, response.id, response.completedById, {
      signerName: request.signerName,
      signerRole: request.signerRole,
      method: 'REMOTE_LINK',
      evidence: input.evidence,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await prisma.anamnesisSignatureRequest.update({
      where: { id: request.id },
      data: { usedAt: new Date() },
    });
    return { ok: true, status: signed.status, effectiveStatus: signed.effectiveStatus };
  }
}

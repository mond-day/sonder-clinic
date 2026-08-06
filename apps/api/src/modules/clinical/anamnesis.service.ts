import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';
import {
  calculateAlertsAndRisk, parseAnamnesisSchema, validateAnswers,
} from './anamnesis-schema';

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json = (value: unknown) => value as Prisma.InputJsonValue;

const templateInputSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  audience: z.enum(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT', 'CUSTOM']),
  schemaJson: z.record(z.string(), z.unknown()),
  validityMonths: z.number().int().min(1).max(36).optional(),
});

@Injectable()
export class AnamnesisService {
  listTemplates(organizationId: string, query?: {
    audience?: string; status?: string; includeArchived?: boolean;
  }) {
    return prisma.anamnesisTemplate.findMany({
      where: {
        organizationId,
        ...(query?.audience ? { audience: query.audience } : {}),
        ...(query?.status ? { status: query.status as never } : {}),
        ...(query?.includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
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

  listPatientResponses(organizationId: string, patientId: string, clinicId?: string) {
    return prisma.anamnesisResponse.findMany({
      where: {
        organizationId,
        patientId,
        ...(clinicId ? { clinicId } : {}),
      },
      include: {
        template: { select: { id: true, name: true, audience: true, version: true } },
        signatures: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getResponse(organizationId: string, id: string) {
    const response = await prisma.anamnesisResponse.findFirst({
      where: { id, organizationId },
      include: {
        template: true,
        signatures: { orderBy: { signedAt: 'asc' } },
        signatureRequests: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!response) throw new NotFoundException('Anamnese não encontrada.');
    return response;
  }

  async createDraft(organizationId: string, patientId: string, actorId: string, input: {
    clinicId: string; templateId: string; answers?: Record<string, unknown>;
  }) {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId } });
    if (!patient) throw new NotFoundException('Paciente não encontrado.');
    const template = await prisma.anamnesisTemplate.findFirst({
      where: { id: input.templateId, organizationId, status: 'PUBLISHED', active: true },
    });
    if (!template) throw new NotFoundException('Modelo publicado não encontrado.');
    const schema = parseAnamnesisSchema(template.schemaJson);
    const answers = input.answers ?? {};
    const { cleaned } = validateAnswers(schema, answers);
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    return prisma.anamnesisResponse.create({
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
  }

  async saveDraft(organizationId: string, id: string, answers: Record<string, unknown>) {
    const response = await this.getResponse(organizationId, id);
    if (response.status !== 'DRAFT' && response.status !== 'AWAITING_SIGNATURE') {
      throw new ConflictException('Anamnese finalizada não pode ser alterada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
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

  async recalculate(organizationId: string, id: string) {
    const response = await this.getResponse(organizationId, id);
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

  async requestSignature(organizationId: string, id: string, input: {
    signerRole: 'PATIENT' | 'GUARDIAN' | 'PROFESSIONAL';
    signerName: string;
    expiresInHours?: number;
  }) {
    const response = await this.getResponse(organizationId, id);
    if (response.status === 'SIGNED' || response.status === 'SUPERSEDED') {
      throw new ConflictException('Anamnese já finalizada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const { errors } = validateAnswers(schema, (response.answers ?? {}) as Record<string, unknown>);
    if (errors.length) throw new BadRequestException({ message: 'Anamnese incompleta.', errors });
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 3600_000);
    const request = await prisma.$transaction(async (tx) => {
      await tx.anamnesisResponse.update({
        where: { id },
        data: { status: 'AWAITING_SIGNATURE' },
      });
      return tx.anamnesisSignatureRequest.create({
        data: {
          anamnesisResponseId: id,
          tokenHash: sha256(token),
          signerRole: input.signerRole,
          signerName: input.signerName,
          expiresAt,
        },
      });
    });
    return {
      requestId: request.id,
      token,
      expiresAt,
      publicPath: `/assinar/anamnese/${token}`,
    };
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
    if (response.status === 'SIGNED' || response.status === 'SUPERSEDED') {
      throw new ConflictException('Anamnese já finalizada.');
    }
    const schema = parseAnamnesisSchema(response.template.schemaJson);
    const answers = (response.answers ?? {}) as Record<string, unknown>;
    const { errors, cleaned } = validateAnswers(schema, answers);
    if (errors.length) throw new BadRequestException({ message: 'Anamnese incompleta.', errors });
    const { alerts, riskAssessment } = calculateAlertsAndRisk(schema, cleaned);
    const signedHash = sha256({ answers: cleaned, templateVersion: response.templateVersion });
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
          signedHash,
        },
      });
      const signatures = await tx.anamnesisSignature.findMany({ where: { anamnesisResponseId: id } });
      const hasPatient = signatures.some((s) => s.signerRole === 'PATIENT' || s.signerRole === 'GUARDIAN');
      const hasProfessional = signatures.some((s) => s.signerRole === 'PROFESSIONAL');
      const finalize = hasPatient && hasProfessional;
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
      return tx.anamnesisResponse.update({
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
          contentHash: finalize ? signedHash : response.contentHash,
        },
        include: { signatures: true, template: true },
      });
    });
  }

  async supersede(organizationId: string, id: string, actorId: string, clinicId: string) {
    const response = await this.getResponse(organizationId, id);
    if (response.status !== 'SIGNED' && response.status !== 'EXPIRED') {
      throw new ConflictException('Somente anamneses assinadas/expiradas podem ser substituídas.');
    }
    const draft = await this.createDraft(organizationId, response.patientId, actorId, {
      clinicId,
      templateId: response.templateId,
      answers: (response.answers ?? {}) as Record<string, unknown>,
    });
    await prisma.anamnesisResponse.update({
      where: { id },
      data: { status: 'SUPERSEDED', supersededById: draft.id },
    });
    return draft;
  }

  async getPublicSignature(token: string) {
    const request = await prisma.anamnesisSignatureRequest.findFirst({
      where: { tokenHash: sha256(token) },
      include: {
        response: {
          include: {
            template: { select: { name: true, audience: true, version: true, schemaJson: true } },
          },
        },
      },
    });
    if (!request || request.revokedAt || request.usedAt || request.expiresAt < new Date()) {
      throw new NotFoundException('Link de assinatura inválido ou expirado.');
    }
    const clinic = await prisma.clinic.findFirst({
      where: { id: request.response.clinicId },
      select: { tradeName: true, legalName: true },
    });
    return {
      signerName: request.signerName,
      signerRole: request.signerRole,
      expiresAt: request.expiresAt,
      clinic,
      template: request.response.template,
      answers: request.response.answers,
      responseId: request.response.id,
    };
  }

  async signPublic(token: string, input: {
    evidence?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const request = await prisma.anamnesisSignatureRequest.findFirst({
      where: { tokenHash: sha256(token) },
    });
    if (!request || request.revokedAt || request.usedAt || request.expiresAt < new Date()) {
      throw new NotFoundException('Link de assinatura inválido ou expirado.');
    }
    const response = await prisma.anamnesisResponse.findUnique({
      where: { id: request.anamnesisResponseId },
    });
    if (!response) throw new NotFoundException('Anamnese não encontrada.');
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
    return { ok: true, status: signed.status };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { createStorageAdapter } from '@sonder/storage';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const brandingAssetUrl = z.string().trim().min(1).max(2048).optional();
const brandingSchema = z.object({
  name: z.string().trim().min(2),
  subtitle: z.string(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoUrl: brandingAssetUrl,
  faviconUrl: brandingAssetUrl,
});
const MAX_BRANDING_BYTES = 2 * 1024 * 1024;
const ALLOWED_BRANDING_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);

const legalSchema = z.object({
  type: z.enum(['PRIVACY', 'TERMS', 'CONSENT']),
  title: z.string().trim().min(2),
  content: z.string().min(20),
  version: z.number().int().min(1),
});
const agendaTagSchema = z.object({
  clinicId: z.string().uuid(),
  name: z.string().trim().min(2).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const updateAgendaTagSchema = agendaTagSchema.omit({ clinicId: true }).partial().extend({ active: z.boolean().optional() });
const unitSchema = z.object({
  clinicId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
});
const updateUnitSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
const chairSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  isSchedulingEnabled: z.boolean().optional(),
});
const updateChairSchema = chairSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type BrandingSettings = {
  name: string;
  subtitle: string;
  primaryColor: string;
  logoUrl?: string;
  faviconUrl?: string;
};

export type LegalDocument = {
  type: 'PRIVACY' | 'TERMS' | 'CONSENT';
  title: string;
  content: string;
  version: number;
  updatedAt: string;
};

@Injectable()
export class SettingsService {
  private readonly storage = createStorageAdapter();
  operationalContext(organizationId: string) {
    return Promise.all([
      prisma.clinic.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: {
          id: true,
          tradeName: true,
          units: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              phone: true,
              timezone: true,
              chairs: {
                where: { status: 'ACTIVE' },
                select: { id: true, name: true, color: true, isSchedulingEnabled: true },
                orderBy: { name: 'asc' },
              },
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { tradeName: 'asc' },
      }),
      prisma.professional.findMany({
        where: { user: { organizationId, status: 'ACTIVE' } },
        select: { id: true, userId: true, name: true, croNumber: true, croState: true },
        orderBy: { name: 'asc' },
      }),
    ]).then(([clinics, professionals]) => ({ clinics, professionals }));
  }

  async getBranding(organizationId: string, clinicId?: string) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException('Organização não encontrada.');
    const clinic = await prisma.clinic.findFirst({ where: { organizationId, status: 'ACTIVE', id: clinicId } });
    const stored = (clinic?.settingsJson as { branding?: Partial<BrandingSettings> } | null)?.branding;
    return {
      name: stored?.name ?? process.env.BRAND_NAME ?? 'Sonder',
      subtitle: stored?.subtitle ?? process.env.BRAND_SUBTITLE ?? 'Clinic',
      primaryColor: stored?.primaryColor ?? process.env.BRAND_PRIMARY_COLOR ?? '#176B5B',
      logoUrl: stored?.logoUrl ?? process.env.BRAND_LOGO_URL,
      faviconUrl: stored?.faviconUrl ?? process.env.BRAND_FAVICON_URL,
      domain: process.env.APP_HOST ?? 'app.sonder.clinic',
      source: stored ? 'tenant' : 'environment',
    };
  }

  async updateBranding(organizationId: string, actorId: string, clinicId: string, branding: BrandingSettings) {
    parseWithZod(brandingSchema, branding);
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const previous = (clinic.settingsJson as Record<string, unknown>) ?? {};
    const next = { ...previous, branding };
    return prisma.$transaction(async (tx) => {
      const updated = await tx.clinic.update({
        where: { id: clinicId },
        data: { settingsJson: json(next) },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'branding.updated',
          entity: 'Clinic',
          entityId: clinicId,
          clinicId,
          changes: { fields: Object.keys(branding) },
          correlationId: randomUUID(),
        },
      });
      return { clinicId: updated.id, branding };
    });
  }

  async getLegal(organizationId: string, clinicId?: string) {
    const clinic = await prisma.clinic.findFirst({ where: { organizationId, status: 'ACTIVE', id: clinicId } });
    const stored = (clinic?.settingsJson as { legal?: LegalDocument[] } | null)?.legal ?? [];
    const defaults: LegalDocument[] = [
      {
        type: 'PRIVACY',
        title: 'Política de Privacidade',
        content: 'Documento configurável de privacidade e tratamento de dados sensíveis de saúde.',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        type: 'TERMS',
        title: 'Política de Uso',
        content: 'Documento configurável de condições de uso do sistema.',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        type: 'CONSENT',
        title: 'Consentimento LGPD',
        content: 'Texto institucional de consentimento, finalidades e canais autorizados.',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ];
    return stored.length ? stored : defaults;
  }

  async upsertLegal(organizationId: string, actorId: string, clinicId: string, document: Omit<LegalDocument, 'updatedAt'>) {
    parseWithZod(legalSchema, document);
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const previous = (clinic.settingsJson as { legal?: LegalDocument[] } & Record<string, unknown>) ?? {};
    const list = previous.legal ?? [];
    const nextDoc: LegalDocument = { ...document, updatedAt: new Date().toISOString() };
    const legal = [...list.filter((item) => item.type !== document.type), nextDoc];
    return prisma.$transaction(async (tx) => {
      await tx.clinic.update({
        where: { id: clinicId },
        data: { settingsJson: json({ ...previous, legal }) },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'legal.document.updated',
          entity: 'Clinic',
          entityId: clinicId,
          clinicId,
          changes: {
            type: document.type,
            version: document.version,
            contentHash: createHash('sha256').update(document.content).digest('hex'),
          },
          correlationId: randomUUID(),
        },
      });
      return nextDoc;
    });
  }

  certificateBootstrap() {
    return {
      configured: Boolean(process.env.A1_CERTIFICATE_PATH),
      passwordConfigured: Boolean(process.env.A1_PASSWORD_FILE),
      downloadAllowed: false,
      storage: 'secret-or-path',
      note: 'Certificado A1 e senha nunca são versionados; use secret/path ou upload criptografado.',
    };
  }

  async agendaTags(organizationId: string, clinicId: string) {
    await this.assertClinic(organizationId, clinicId);
    return prisma.agendaTag.findMany({
      where: { organizationId, clinicId, active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createAgendaTag(organizationId: string, actorId: string, input: { clinicId: string; name: string; color: string }) {
    const data = parseWithZod(agendaTagSchema, input);
    await this.assertClinic(organizationId, data.clinicId);
    return prisma.$transaction(async (tx) => {
      const tag = await tx.agendaTag.create({ data: { organizationId, ...data } });
      await tx.auditEvent.create({
        data: {
          actorId, action: 'agenda_tag.created', entity: 'AgendaTag', entityId: tag.id,
          clinicId: data.clinicId, changes: { name: data.name, color: data.color }, correlationId: randomUUID(),
        },
      });
      return tag;
    });
  }

  async updateAgendaTag(
    organizationId: string,
    actorId: string,
    id: string,
    input: { name?: string; color?: string; active?: boolean },
  ) {
    const data = parseWithZod(updateAgendaTagSchema, input);
    const existing = await prisma.agendaTag.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Etiqueta não encontrada.');
    return prisma.$transaction(async (tx) => {
      const tag = await tx.agendaTag.update({ where: { id }, data });
      await tx.auditEvent.create({
        data: {
          actorId, action: 'agenda_tag.updated', entity: 'AgendaTag', entityId: id,
          clinicId: existing.clinicId, changes: { fields: Object.keys(data) }, correlationId: randomUUID(),
        },
      });
      return tag;
    });
  }

  async uploadBrandingAsset(
    organizationId: string,
    actorId: string,
    clinicId: string,
    kind: 'logo' | 'favicon',
    file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
  ) {
    await this.assertClinic(organizationId, clinicId);
    if (!this.storage.enabled) {
      throw new BadRequestException(
        this.storage.disabledReason
          ?? 'Storage desabilitado — configure STORAGE_DRIVER=local ou MinIO/S3 com credenciais.',
      );
    }
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo de imagem.');
    if (file.size > MAX_BRANDING_BYTES) throw new BadRequestException('A imagem deve ter no máximo 2 MB.');
    const mime = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_BRANDING_TYPES.has(mime)) {
      throw new BadRequestException('Envie PNG, JPEG, WEBP, SVG ou ICO.');
    }
    const extension = file.originalname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
    const stored = await this.storage.putObject({
      organizationId,
      clinicId,
      filename: `${kind}${extension || '.png'}`,
      contentType: mime,
      body: file.buffer,
      keyPrefix: 'branding',
      metadata: { kind: `branding-${kind}`, clinicId },
    });
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const fileObject = await prisma.fileObject.create({
      data: {
        organizationId,
        bucket: stored.bucket,
        objectKey: stored.objectKey,
        originalName: file.originalname,
        mimeType: mime,
        extension: extension || null,
        sizeBytes: BigInt(file.size),
        checksum,
        status: 'AVAILABLE',
        antivirusStatus: 'PENDING',
        createdById: actorId,
        metadata: json({ kind: `branding-${kind}`, clinicId }),
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId,
        action: 'branding.asset.uploaded',
        entity: 'FileObject',
        entityId: fileObject.id,
        clinicId,
        changes: { kind, mime },
        correlationId: randomUUID(),
      },
    });
    return {
      fileId: fileObject.id,
      url: `/api/v1/settings/branding/assets/${fileObject.id}`,
      kind,
    };
  }

  async getBrandingAsset(organizationId: string, fileId: string) {
    const file = await prisma.fileObject.findFirst({
      where: { id: fileId, organizationId },
    });
    const kind = String((file?.metadata as { kind?: string } | null)?.kind ?? '');
    if (!file || !kind.startsWith('branding-')) {
      throw new NotFoundException('Asset de identidade não encontrado.');
    }
    const body = await this.storage.getObject(file.objectKey);
    return { body, mimeType: file.mimeType, originalName: file.originalName };
  }

  async listUnits(organizationId: string, clinicId: string) {
    await this.assertClinic(organizationId, clinicId);
    return prisma.unit.findMany({
      where: { clinicId, clinic: { organizationId } },
      include: {
        chairs: { orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createUnit(
    organizationId: string,
    actorId: string,
    input: { clinicId: string; name: string; phone?: string; timezone?: string },
  ) {
    const data = parseWithZod(unitSchema, input);
    await this.assertClinic(organizationId, data.clinicId);
    return prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: {
          clinicId: data.clinicId,
          name: data.name,
          phone: data.phone,
          timezone: data.timezone ?? 'America/Cuiaba',
        },
        include: { chairs: true },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'unit.created',
          entity: 'Unit',
          entityId: unit.id,
          clinicId: data.clinicId,
          changes: { name: data.name },
          correlationId: randomUUID(),
        },
      });
      return unit;
    });
  }

  async updateUnit(
    organizationId: string,
    actorId: string,
    id: string,
    input: { name?: string; phone?: string | null; timezone?: string; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    const data = parseWithZod(updateUnitSchema, input);
    const existing = await prisma.unit.findFirst({
      where: { id, clinic: { organizationId } },
      select: { id: true, clinicId: true },
    });
    if (!existing) throw new NotFoundException('Unidade não encontrada.');
    return prisma.$transaction(async (tx) => {
      const unit = await tx.unit.update({
        where: { id },
        data: {
          name: data.name,
          phone: data.phone === undefined ? undefined : data.phone,
          timezone: data.timezone,
          status: data.status,
        },
        include: { chairs: { orderBy: { name: 'asc' } } },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'unit.updated',
          entity: 'Unit',
          entityId: id,
          clinicId: existing.clinicId,
          changes: { fields: Object.keys(data) },
          correlationId: randomUUID(),
        },
      });
      return unit;
    });
  }

  async createChair(
    organizationId: string,
    actorId: string,
    unitId: string,
    input: { name: string; color?: string; isSchedulingEnabled?: boolean },
  ) {
    const data = parseWithZod(chairSchema, input);
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, clinic: { organizationId }, status: 'ACTIVE' },
      select: { id: true, clinicId: true },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    return prisma.$transaction(async (tx) => {
      const chair = await tx.chair.create({
        data: {
          unitId,
          name: data.name,
          color: data.color ?? '#176B5B',
          isSchedulingEnabled: data.isSchedulingEnabled ?? true,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'chair.created',
          entity: 'Chair',
          entityId: chair.id,
          clinicId: unit.clinicId,
          changes: { name: data.name, unitId },
          correlationId: randomUUID(),
        },
      });
      return chair;
    });
  }

  async updateChair(
    organizationId: string,
    actorId: string,
    id: string,
    input: { name?: string; color?: string; isSchedulingEnabled?: boolean; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    const data = parseWithZod(updateChairSchema, input);
    const existing = await prisma.chair.findFirst({
      where: { id, unit: { clinic: { organizationId } } },
      select: { id: true, unit: { select: { clinicId: true } } },
    });
    if (!existing) throw new NotFoundException('Cadeira não encontrada.');
    return prisma.$transaction(async (tx) => {
      const chair = await tx.chair.update({ where: { id }, data });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'chair.updated',
          entity: 'Chair',
          entityId: id,
          clinicId: existing.unit.clinicId,
          changes: { fields: Object.keys(data) },
          correlationId: randomUUID(),
        },
      });
      return chair;
    });
  }

  listClinics(organizationId: string, includeInactive = false) {
    return prisma.clinic.findMany({
      where: { organizationId, ...(includeInactive ? {} : { status: 'ACTIVE' }) },
      orderBy: { tradeName: 'asc' },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        taxId: true,
        email: true,
        phone: true,
        status: true,
        _count: { select: { units: true } },
      },
    });
  }

  async createClinic(
    organizationId: string,
    actorId: string,
    input: { legalName: string; tradeName: string; taxId?: string; email?: string; phone?: string },
  ) {
    return prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: {
          organizationId,
          legalName: input.legalName.trim(),
          tradeName: input.tradeName.trim(),
          taxId: input.taxId?.trim(),
          email: input.email?.trim(),
          phone: input.phone?.trim(),
          status: 'ACTIVE',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'clinic.created',
          entity: 'Clinic',
          entityId: clinic.id,
          clinicId: clinic.id,
          changes: { tradeName: clinic.tradeName },
          correlationId: randomUUID(),
        },
      });
      return clinic;
    });
  }

  async updateClinic(
    organizationId: string,
    actorId: string,
    id: string,
    input: {
      legalName?: string;
      tradeName?: string;
      taxId?: string | null;
      email?: string | null;
      phone?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    const existing = await prisma.clinic.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Clínica não encontrada.');
    if (input.status === 'INACTIVE') {
      const activeCount = await prisma.clinic.count({
        where: { organizationId, status: 'ACTIVE', id: { not: id } },
      });
      if (activeCount === 0) {
        throw new BadRequestException('Não é possível inativar a última clínica ativa da organização.');
      }
    }
    return prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.update({
        where: { id },
        data: {
          legalName: input.legalName?.trim(),
          tradeName: input.tradeName?.trim(),
          taxId: input.taxId === undefined ? undefined : input.taxId,
          email: input.email === undefined ? undefined : input.email,
          phone: input.phone === undefined ? undefined : input.phone,
          status: input.status,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'clinic.updated',
          entity: 'Clinic',
          entityId: id,
          clinicId: id,
          changes: { fields: Object.keys(input) },
          correlationId: randomUUID(),
        },
      });
      return clinic;
    });
  }

  listDeadLetterOutbox(limit = 50) {
    return prisma.outboxEvent.findMany({
      where: { deadLetterAt: { not: null } },
      orderBy: { deadLetterAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async retryDeadLetterOutbox(id: string, actorId: string) {
    const event = await prisma.outboxEvent.findFirst({ where: { id, deadLetterAt: { not: null } } });
    if (!event) throw new NotFoundException('Evento dead-letter não encontrado.');
    const updated = await prisma.outboxEvent.update({
      where: { id },
      data: {
        deadLetterAt: null,
        attempts: 0,
        lastError: null,
        lockedBy: null,
        leaseUntil: null,
        processingAt: null,
        processedAt: null,
      },
    });
    await prisma.auditEvent.create({
      data: {
        actorId,
        action: 'outbox.dead_letter.retry',
        entity: 'OutboxEvent',
        entityId: id,
        changes: { eventType: event.eventType },
        correlationId: randomUUID(),
      },
    });
    return updated;
  }

  async discardDeadLetterOutbox(id: string, actorId: string) {
    const event = await prisma.outboxEvent.findFirst({ where: { id, deadLetterAt: { not: null } } });
    if (!event) throw new NotFoundException('Evento dead-letter não encontrado.');
    await prisma.auditEvent.create({
      data: {
        actorId,
        action: 'outbox.dead_letter.discard',
        entity: 'OutboxEvent',
        entityId: id,
        changes: { eventType: event.eventType, payload: event.payload },
        correlationId: randomUUID(),
      },
    });
    await prisma.outboxEvent.delete({ where: { id } });
    return { success: true as const };
  }

  private async assertClinic(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
}

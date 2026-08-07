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
            select: { id: true, name: true, chairs: { select: { id: true, name: true } } },
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

  private async assertClinic(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({ where: { id: clinicId, organizationId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
}

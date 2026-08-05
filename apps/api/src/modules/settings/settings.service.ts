import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const brandingSchema = z.object({
  name: z.string().trim().min(2),
  subtitle: z.string(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
});
const legalSchema = z.object({
  type: z.enum(['PRIVACY', 'TERMS', 'CONSENT']),
  title: z.string().trim().min(2),
  content: z.string().min(20),
  version: z.number().int().min(1),
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
        select: { id: true, name: true, croNumber: true, croState: true },
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
}

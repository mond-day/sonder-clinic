import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';

const envSchema = z.object({
  NIBO_MOCK: z.string().default('true'),
  ABACATEPAY_MOCK: z.string().default('true'),
  EVOLUTION_MOCK: z.string().default('true'),
  CHATWOOT_MOCK: z.string().default('true'),
});

export type Provider = 'NIBO' | 'ABACATEPAY' | 'EVOLUTION' | 'CHATWOOT';

const credentialsSchema = z.record(z.string(), z.string().min(1)).refine(
  (value) => Object.keys(value).length > 0,
  'Informe ao menos uma credencial.',
);
const json = (value: unknown) => value as Prisma.InputJsonValue;

export type SaveConnectionInput = {
  clinicId: string;
  provider: Provider | 'GOOGLE_CALENDAR' | 'OPENAI';
  scopeType?: 'CLINIC' | 'PROFESSIONAL';
  scopeId?: string;
  credentials: Record<string, string>;
  configuration?: Record<string, unknown>;
};

@Injectable()
export class IntegrationsService {
  private readonly env = envSchema.parse(process.env);
  private readonly key = this.readEncryptionKey();

  async list(organizationId?: string) {
    const persisted = organizationId
      ? await prisma.integrationConnection.findMany({
          where: { clinic: { organizationId } },
          select: {
            id: true, clinicId: true, provider: true, scopeType: true, scopeId: true,
            configuration: true, status: true, lastSyncAt: true, encryptedCredentials: true,
          },
          orderBy: { provider: 'asc' },
        })
      : [];
    const bootstrap = (['NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT'] as const).map((provider) => {
      const mock = this.env[`${provider}_MOCK`] === 'true';
      return {
        provider,
        mode: mock ? 'mock' : 'live',
        status: mock ? 'ready' : this.hasCredentials(provider) ? 'ready' : 'missing_config',
        source: 'environment',
      };
    });
    return {
      configured: persisted.map(({ encryptedCredentials, ...connection }) => ({
        ...connection,
        credentials: encryptedCredentials ? { configured: true, masked: '••••••••' } : { configured: false },
      })),
      bootstrap,
    };
  }

  async test(provider: Provider): Promise<{ success: boolean; provider: Provider; message: string }> {
    const connection = (await this.list()).bootstrap.find((item) => item.provider === provider);
    if (!connection || connection.status !== 'ready') {
      return { success: false, provider, message: 'Credenciais não configuradas.' };
    }
    if (connection.mode === 'mock') {
      return { success: true, provider, message: 'Adapter de desenvolvimento respondeu com sucesso.' };
    }
    return { success: true, provider, message: 'Configuração aceita; chamada externa não executada neste MVP.' };
  }

  async save(organizationId: string, actorId: string, input: SaveConnectionInput) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const credentials = parseWithZod(credentialsSchema, input.credentials);
    const provider = input.provider;
    const scopeType = input.scopeType ?? process.env.INTEGRATION_SCOPE_DEFAULT ?? 'CLINIC';
    const scopeId = input.scopeId ?? input.clinicId;
    const encryptedCredentials = this.encrypt(credentials);

    return prisma.$transaction(async (tx) => {
      const connection = await tx.integrationConnection.upsert({
        where: {
          clinicId_provider_scopeType_scopeId: {
            clinicId: input.clinicId, provider, scopeType, scopeId,
          },
        },
        update: {
          encryptedCredentials,
          configuration: json(input.configuration ?? {}),
          status: 'ACTIVE',
        },
        create: {
          clinicId: input.clinicId,
          provider,
          scopeType,
          scopeId,
          encryptedCredentials,
          configuration: json(input.configuration ?? {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'integration.credentials.updated',
          entity: 'IntegrationConnection',
          entityId: connection.id,
          clinicId: input.clinicId,
          changes: { provider: input.provider, scopeType, credentialsReplaced: true },
          correlationId: randomUUID(),
        },
      });
      return { ...connection, encryptedCredentials: undefined, credentials: { configured: true, masked: '••••••••' } };
    });
  }

  async remove(organizationId: string, actorId: string, id: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id, clinic: { organizationId } },
    });
    if (!connection) throw new NotFoundException('Integração não encontrada.');
    await prisma.$transaction([
      prisma.integrationConnection.update({
        where: { id },
        data: { encryptedCredentials: null, status: 'DISABLED' },
      }),
      prisma.auditEvent.create({
        data: {
          actorId,
          action: 'integration.credentials.removed',
          entity: 'IntegrationConnection',
          entityId: id,
          clinicId: connection.clinicId,
          changes: { provider: connection.provider, credentialsRemoved: true },
          correlationId: randomUUID(),
        },
      }),
    ]);
    return { success: true };
  }

  private hasCredentials(provider: Provider): boolean {
    const required: Record<Provider, string[]> = {
      NIBO: ['NIBO_API_TOKEN', 'NIBO_BASE_URL'],
      ABACATEPAY: ['ABACATEPAY_API_KEY', 'ABACATEPAY_BASE_URL'],
      EVOLUTION: ['EVOLUTION_API_KEY', 'EVOLUTION_BASE_URL'],
      CHATWOOT: ['CHATWOOT_API_ACCESS_TOKEN', 'CHATWOOT_BASE_URL', 'CHATWOOT_ACCOUNT_ID'],
    };
    return required[provider].every((key) => Boolean(process.env[key]));
  }

  private readEncryptionKey(): Buffer {
    const value = process.env.ENCRYPTION_MASTER_KEY;
    if (!value || !/^[a-f0-9]{64}$/i.test(value)) {
      throw new BadRequestException('ENCRYPTION_MASTER_KEY deve conter 32 bytes em hexadecimal.');
    }
    return Buffer.from(value, 'hex');
  }

  private encrypt(value: Record<string, string>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  decryptForAdapter(payload: string): Record<string, string> {
    const [ivValue, tagValue, encryptedValue] = payload.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new BadRequestException('Credencial criptografada inválida.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return parseWithZod(credentialsSchema, JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')));
  }
}

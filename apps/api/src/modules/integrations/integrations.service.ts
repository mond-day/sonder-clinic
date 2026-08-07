import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { storageStatus } from '@sonder/storage';
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
const providerCredentials = {
  NIBO: z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1), token: z.string().min(1), organizationId: z.string().min(1), accountId: z.string().min(1) }),
  ABACATEPAY: z.object({ apiKey: z.string().min(1), webhookSecret: z.string().min(1) }),
  EVOLUTION: z.object({ apiKey: z.string().min(1), instanceName: z.string().min(1) }),
  CHATWOOT: z.object({ apiToken: z.string().min(1), webhookSecret: z.string().min(1) }),
  GOOGLE_CALENDAR: z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) }),
  OPENAI: z.object({ apiKey: z.string().min(1) }),
} as const;
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
      storage: storageStatus().storage,
      antivirus: storageStatus().antivirus,
    };
  }

  async test(provider: Provider | 'GOOGLE_CALENDAR' | 'OPENAI') {
    const { testProvider } = await import('../../integrations/adapters');
    return testProvider(provider);
  }

  async testConnection(organizationId: string, id: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id, clinic: { organizationId } },
    });
    if (!connection) throw new NotFoundException('Integração não encontrada.');
    if (!connection.encryptedCredentials) {
      return {
        success: false,
        provider: connection.provider,
        connectionId: id,
        enabled: false,
        message: 'Conexão sem credenciais salvas. Configure as credenciais antes de testar.',
        mode: 'stub',
      };
    }
    const credentials = this.decryptForAdapter(connection.encryptedCredentials);
    const provider = connection.provider as Provider | 'GOOGLE_CALENDAR' | 'OPENAI';
    if (provider === 'GOOGLE_CALENDAR') {
      return this.googleCalendarOauthStatus(organizationId, id, credentials);
    }
    const mock = (process.env[`${provider}_MOCK`] ?? 'true').toLowerCase() === 'true';
    if (mock) {
      return {
        success: false,
        provider,
        connectionId: id,
        enabled: false,
        message: `${provider} em modo MOCK (*_MOCK=true). Credenciais da conexão foram carregadas, mas nenhum sucesso foi simulado.`,
        mode: 'mock',
        credentialsConfigured: Object.keys(credentials).length > 0,
      };
    }
    const { testProvider } = await import('../../integrations/adapters');
    const result = await testProvider(provider);
    await prisma.integrationConnection.update({
      where: { id },
      data: {
        lastSyncAt: result.success ? new Date() : connection.lastSyncAt,
        status: result.success ? 'ACTIVE' : connection.status === 'DISABLED' ? 'DISABLED' : 'ERROR',
      },
    });
    return {
      ...result,
      connectionId: id,
      mode: 'live',
      credentialsConfigured: true,
      note: 'Teste usa adapter do provedor; credenciais persistidas foram descriptografadas para validar presença, não reenviadas ao cliente.',
    };
  }

  /**
   * Superfície honesta do OAuth Google Calendar (A38).
   * Sem clientId/secret → stub explícito. Com credenciais → ainda PARTIAL (fluxo OAuth/sync bidirecional não implementado).
   */
  googleCalendarOauthStatus(
    organizationId?: string,
    connectionId?: string,
    connectionCredentials?: Record<string, string>,
  ) {
    void organizationId;
    const envMock = (process.env.GOOGLE_CALENDAR_MOCK ?? 'true').toLowerCase() === 'true';
    const envClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const clientId = connectionCredentials?.clientId?.trim() || envClientId;
    const clientSecret = connectionCredentials?.clientSecret?.trim() || envClientSecret;
    const hasCredentials = Boolean(clientId && clientSecret);

    if (envMock || !hasCredentials) {
      return {
        success: false,
        provider: 'GOOGLE_CALENDAR' as const,
        connectionId: connectionId ?? null,
        enabled: false,
        oauthReady: false,
        syncBidirectional: false,
        status: 'PARTIAL_STUB',
        mode: envMock ? 'mock' : 'missing_credentials',
        message: envMock
          ? 'Google Calendar em MOCK (GOOGLE_CALENDAR_MOCK=true). OAuth e sync bidirecional não estão disponíveis — não declarar GO.'
          : 'Google Calendar sem credenciais. Configure clientId/clientSecret na conexão ou GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. OAuth ainda é stub (A38).',
      };
    }

    return {
      success: false,
      provider: 'GOOGLE_CALENDAR' as const,
      connectionId: connectionId ?? null,
      enabled: true,
      oauthReady: false,
      syncBidirectional: false,
      status: 'PARTIAL_STUB',
      mode: 'credentials_present',
      message:
        'Credenciais presentes, mas o fluxo OAuth (consentimento + refresh token) e a sincronização bidirecional ainda não estão implementados. Status PARTIAL — não declarar GO.',
    };
  }

  async startGoogleCalendarOauth(organizationId: string, connectionId: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, clinic: { organizationId }, provider: 'GOOGLE_CALENDAR' },
    });
    if (!connection) throw new NotFoundException('Conexão Google Calendar não encontrada.');
    const credentials = connection.encryptedCredentials
      ? this.decryptForAdapter(connection.encryptedCredentials)
      : {};
    const status = this.googleCalendarOauthStatus(organizationId, connectionId, credentials);
    // Nunca simular redirect OAuth bem-sucedido.
    throw new BadRequestException(
      `${status.message} Endpoint /integrations/:id/oauth/start existe como superfície; implemente o consentimento Google antes de usar em produção.`,
    );
  }

  async save(organizationId: string, actorId: string, input: SaveConnectionInput) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const provider = input.provider;
    const schema = providerCredentials[provider] as z.ZodType<Record<string, string>>;
    const credentials = parseWithZod(schema, input.credentials);
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

  async setStatus(organizationId: string, actorId: string, id: string, status: 'ACTIVE' | 'DISABLED') {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id, clinic: { organizationId } },
    });
    if (!connection) throw new NotFoundException('Integração não encontrada.');
    if (status === 'ACTIVE' && !connection.encryptedCredentials) {
      throw new BadRequestException('Configure as credenciais antes de reativar a integração.');
    }
    await prisma.$transaction([
      prisma.integrationConnection.update({ where: { id }, data: { status } }),
      prisma.auditEvent.create({
        data: {
          actorId,
          action: status === 'ACTIVE' ? 'integration.activated' : 'integration.disabled',
          entity: 'IntegrationConnection',
          entityId: id,
          clinicId: connection.clinicId,
          changes: { provider: connection.provider, status },
          correlationId: randomUUID(),
        },
      }),
    ]);
    return { id, status };
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

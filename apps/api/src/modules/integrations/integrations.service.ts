import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, prisma } from '@sonder/database';
import { storageStatus } from '@sonder/storage';
import { z } from 'zod';
import { parseWithZod } from '../../common/zod-validation';
import {
  buildGoogleAuthorizeUrl,
  ensureFreshAccessToken,
  exchangeGoogleAuthCode,
  getGoogleCalendarEvent,
  isGoogleCalendarMock,
  isSonderClinicSyncedEvent,
  listGoogleCalendarEvents,
  mergeTokenCredentials,
  rangesOverlap,
  readCalendarId,
  resolveGoogleCalendarWebhookToken,
  resolveGoogleCalendarWebhookUrl,
  resolveGoogleOAuthCredentials,
  signOAuthState,
  stopGoogleCalendarChannel,
  testGoogleCalendarAccess,
  tokensFromCredentials,
  verifyGoogleWebhookHeaders,
  verifyOAuthState,
  watchGoogleCalendarEvents,
  type GoogleCalendarListedEvent,
} from './google-calendar.utils';

export type PersonalCalendarWarning = {
  type: 'personal_calendar';
  message: string;
  eventId: string;
  summary: string;
  startAt: string;
  endAt: string;
};

export type PersonalCalendarEventDto = {
  id: string;
  summary: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  source: 'google_personal';
};

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
      return this.probeGoogleCalendarLive(id, credentials, connection.configuration);
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
   * Status honesto do OAuth Google Calendar (A38 / Fatia 4).
   * Sem clientId/secret/redirect → disabled. Com OAuth (refresh_token) → ready para sync.
   */
  googleCalendarOauthStatus(
    organizationId?: string,
    connectionId?: string,
    connectionCredentials?: Record<string, string>,
    configuration?: unknown,
  ) {
    void organizationId;
    const envMock = isGoogleCalendarMock();
    const oauth = resolveGoogleOAuthCredentials(connectionCredentials);
    const tokens = connectionCredentials ? tokensFromCredentials(connectionCredentials) : null;
    const calendarId = readCalendarId(configuration);

    if (envMock) {
      return {
        success: false,
        provider: 'GOOGLE_CALENDAR' as const,
        connectionId: connectionId ?? null,
        enabled: false,
        oauthReady: false,
        syncBidirectional: false,
        calendarId,
        status: 'DISABLED_MOCK',
        mode: 'mock',
        message:
          'Google Calendar em MOCK (GOOGLE_CALENDAR_MOCK=true). Defina MOCK=false + GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI e conclua OAuth para habilitar.',
      };
    }

    if (!oauth) {
      return {
        success: false,
        provider: 'GOOGLE_CALENDAR' as const,
        connectionId: connectionId ?? null,
        enabled: false,
        oauthReady: false,
        syncBidirectional: false,
        calendarId,
        status: 'MISSING_CREDENTIALS',
        mode: 'missing_credentials',
        message:
          'Google Calendar sem credenciais. Configure clientId/clientSecret na conexão e GOOGLE_REDIRECT_URI (ou GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI no env).',
      };
    }

    if (!tokens?.refreshToken) {
      return {
        success: false,
        provider: 'GOOGLE_CALENDAR' as const,
        connectionId: connectionId ?? null,
        enabled: true,
        oauthReady: false,
        syncBidirectional: false,
        calendarId,
        status: 'OAUTH_PENDING',
        mode: 'credentials_present',
        message:
          'Credenciais OAuth presentes, mas falta consentimento (refresh_token). Use "Iniciar OAuth" e autorize no Google.',
      };
    }

    return {
      success: true,
      provider: 'GOOGLE_CALENDAR' as const,
      connectionId: connectionId ?? null,
      enabled: true,
      oauthReady: true,
      syncBidirectional: true,
      calendarId,
      status: 'READY',
      mode: 'live',
      message:
        'Google Calendar OAuth pronto. Sync: clinic→Google (outbox); Google→clinic via pull-sync e webhook push se GOOGLE_CALENDAR_WEBHOOK_URL estiver configurada.',
      webhookConfigured: Boolean(resolveGoogleCalendarWebhookUrl()),
    };
  }

  async startGoogleCalendarOauth(organizationId: string, connectionId: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, clinic: { organizationId }, provider: 'GOOGLE_CALENDAR' },
    });
    if (!connection) throw new NotFoundException('Conexão Google Calendar não encontrada.');
    if (connection.status === 'DISABLED') {
      throw new BadRequestException('Reative a integração antes de iniciar o OAuth.');
    }
    const credentials = connection.encryptedCredentials
      ? this.decryptForAdapter(connection.encryptedCredentials)
      : {};
    if (isGoogleCalendarMock()) {
      throw new BadRequestException(
        'Google Calendar em MOCK (GOOGLE_CALENDAR_MOCK=true). Defina MOCK=false para iniciar OAuth.',
      );
    }
    const oauth = resolveGoogleOAuthCredentials(credentials);
    if (!oauth) {
      throw new BadRequestException(
        'Configure clientId/clientSecret na conexão e GOOGLE_REDIRECT_URI no ambiente antes do OAuth.',
      );
    }
    const state = signOAuthState(connectionId, process.env.ENCRYPTION_MASTER_KEY!);
    const authorizeUrl = buildGoogleAuthorizeUrl(oauth, state);
    const prev =
      connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
        ? { ...(connection.configuration as Record<string, unknown>) }
        : {};
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        configuration: {
          ...prev,
          pendingOauthState: state,
          pendingOauthAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return {
      success: true,
      provider: 'GOOGLE_CALENDAR' as const,
      connectionId,
      authorizeUrl,
      message: 'Abra authorizeUrl para conceder acesso ao Google Calendar.',
    };
  }

  async handleGoogleOauthCallback(code: string | undefined, state: string | undefined) {
    if (!code?.trim() || !state?.trim()) {
      throw new BadRequestException('Callback Google incompleto: informe code e state.');
    }
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey || !/^[a-f0-9]{64}$/i.test(masterKey)) {
      throw new BadRequestException('ENCRYPTION_MASTER_KEY inválida no servidor.');
    }
    const verified = verifyOAuthState(state, masterKey);
    if (!verified) {
      throw new BadRequestException('State OAuth inválido ou expirado.');
    }
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: verified.connectionId, provider: 'GOOGLE_CALENDAR' },
      include: { clinic: { select: { organizationId: true, tradeName: true } } },
    });
    if (!connection) throw new NotFoundException('Conexão Google Calendar não encontrada.');
    const config =
      connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
        ? (connection.configuration as Record<string, unknown>)
        : {};
    if (config.pendingOauthState && config.pendingOauthState !== state) {
      throw new BadRequestException('State OAuth não corresponde ao início desta autorização.');
    }
    const baseCredentials = connection.encryptedCredentials
      ? this.decryptForAdapter(connection.encryptedCredentials)
      : {};
    const oauth = resolveGoogleOAuthCredentials(baseCredentials);
    if (!oauth) {
      throw new BadRequestException('Credenciais OAuth ausentes na conexão.');
    }
    const tokens = await exchangeGoogleAuthCode(oauth, code.trim());
    const encryptedCredentials = this.encrypt(mergeTokenCredentials(baseCredentials, tokens));
    const { pendingOauthState: _pending, pendingOauthAt: _at, ...restConfig } = config;
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        encryptedCredentials,
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        configuration: {
          ...restConfig,
          calendarId: readCalendarId(config),
          oauthConnectedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return {
      success: true,
      connectionId: connection.id,
      redirectTo: `${webUrl}/configuracoes?integration=GOOGLE_CALENDAR&oauth=ok`,
      message: 'OAuth Google Calendar concluído. Tokens armazenados criptografados.',
    };
  }

  async pullGoogleCalendarSync(organizationId: string, connectionId: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, clinic: { organizationId }, provider: 'GOOGLE_CALENDAR' },
    });
    if (!connection) throw new NotFoundException('Conexão Google Calendar não encontrada.');
    if (isGoogleCalendarMock()) {
      throw new BadRequestException('Google Calendar em MOCK — pull-sync desabilitado.');
    }
    if (!connection.encryptedCredentials) {
      throw new BadRequestException('Conexão sem credenciais.');
    }
    let credentials = this.decryptForAdapter(connection.encryptedCredentials);
    const oauth = resolveGoogleOAuthCredentials(credentials);
    if (!oauth || !tokensFromCredentials(credentials)) {
      throw new BadRequestException('Conclua o OAuth antes do pull-sync.');
    }
    const fresh = await ensureFreshAccessToken(oauth, credentials);
    if (fresh.refreshed) {
      credentials = fresh.credentials;
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { encryptedCredentials: this.encrypt(credentials) },
      });
    }
    const calendarId = readCalendarId(connection.configuration);
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: connection.clinicId,
        organizationId,
        externalCalendarEventId: { not: null },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { id: true, startAt: true, endAt: true, externalCalendarEventId: true, version: true },
      take: 200,
    });
    let updated = 0;
    let checked = 0;
    for (const appointment of appointments) {
      if (!appointment.externalCalendarEventId) continue;
      checked += 1;
      const remote = await getGoogleCalendarEvent(
        fresh.accessToken,
        calendarId,
        appointment.externalCalendarEventId,
      );
      if (!remote) continue;
      const startChanged = remote.startAt.getTime() !== appointment.startAt.getTime();
      const endChanged = remote.endAt.getTime() !== appointment.endAt.getTime();
      if (!startChanged && !endChanged) continue;
      if (remote.endAt <= remote.startAt) continue;
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          startAt: remote.startAt,
          endAt: remote.endAt,
          version: { increment: 1 },
          source: 'GOOGLE_CALENDAR',
        },
      });
      updated += 1;
    }
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });
    return {
      success: true,
      connectionId,
      checked,
      updated,
      message: `Pull-sync: ${updated} agendamento(s) atualizado(s) de ${checked} evento(s) vinculados.`,
    };
  }

  async registerGoogleCalendarWatch(organizationId: string, connectionId: string) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, clinic: { organizationId }, provider: 'GOOGLE_CALENDAR' },
    });
    if (!connection) throw new NotFoundException('Conexão Google Calendar não encontrada.');
    if (isGoogleCalendarMock()) {
      throw new BadRequestException('Google Calendar em MOCK — webhook watch desabilitado.');
    }
    const webhookUrl = resolveGoogleCalendarWebhookUrl();
    if (!webhookUrl) {
      throw new BadRequestException(
        'Defina GOOGLE_CALENDAR_WEBHOOK_URL (HTTPS público) para registrar o canal push.',
      );
    }
    if (!connection.encryptedCredentials) {
      throw new BadRequestException('Conexão sem credenciais.');
    }
    let credentials = this.decryptForAdapter(connection.encryptedCredentials);
    const oauth = resolveGoogleOAuthCredentials(credentials);
    if (!oauth || !tokensFromCredentials(credentials)) {
      throw new BadRequestException('Conclua o OAuth antes de registrar o webhook.');
    }
    const fresh = await ensureFreshAccessToken(oauth, credentials);
    if (fresh.refreshed) {
      credentials = fresh.credentials;
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { encryptedCredentials: this.encrypt(credentials) },
      });
    }
    const config =
      connection.configuration && typeof connection.configuration === 'object' && !Array.isArray(connection.configuration)
        ? { ...(connection.configuration as Record<string, unknown>) }
        : {};
    const prevChannelId = typeof config.webhookChannelId === 'string' ? config.webhookChannelId : '';
    const prevResourceId = typeof config.webhookResourceId === 'string' ? config.webhookResourceId : '';
    if (prevChannelId && prevResourceId) {
      try {
        await stopGoogleCalendarChannel(fresh.accessToken, prevChannelId, prevResourceId);
      } catch {
        /* canal já expirado — segue registro */
      }
    }
    const channelId = randomUUID();
    const token =
      resolveGoogleCalendarWebhookToken(config)
      || randomBytes(24).toString('hex');
    const calendarId = readCalendarId(config);
    const watch = await watchGoogleCalendarEvents(fresh.accessToken, calendarId, {
      channelId,
      address: webhookUrl,
      token,
    });
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        configuration: {
          ...config,
          calendarId,
          webhookChannelId: watch.channelId,
          webhookResourceId: watch.resourceId,
          webhookChannelToken: token,
          webhookExpiration: watch.expiration ?? null,
          webhookRegisteredAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        lastSyncAt: new Date(),
      },
    });
    return {
      success: true,
      connectionId,
      channelId: watch.channelId,
      resourceId: watch.resourceId,
      expiration: watch.expiration,
      webhookUrl,
      message:
        'Canal push registrado. Google notificará mudanças; o servidor responde com pull-sync. Renove o canal antes da expiration (~7 dias).',
    };
  }

  async handleGoogleCalendarWebhook(headers: {
    channelId?: string;
    channelToken?: string;
    resourceId?: string;
    resourceState?: string;
    messageNumber?: string;
  }) {
    const verified = verifyGoogleWebhookHeaders({
      channelId: headers.channelId,
      channelToken: headers.channelToken,
      resourceState: headers.resourceState,
    });
    if (!verified.ok) {
      throw new BadRequestException(verified.reason ?? 'Webhook Google inválido.');
    }

    const channelId = headers.channelId!.trim();
    const connections = await prisma.integrationConnection.findMany({
      where: { provider: 'GOOGLE_CALENDAR', status: 'ACTIVE' },
      include: { clinic: { select: { organizationId: true } } },
      take: 200,
    });
    const match = connections.find((row) => {
      const cfg =
        row.configuration && typeof row.configuration === 'object' && !Array.isArray(row.configuration)
          ? (row.configuration as Record<string, unknown>)
          : {};
      return cfg.webhookChannelId === channelId;
    });
    if (!match) {
      return { success: true, ignored: true, message: 'Canal desconhecido — ACK sem sync.' };
    }

    const cfg =
      match.configuration && typeof match.configuration === 'object' && !Array.isArray(match.configuration)
        ? (match.configuration as Record<string, unknown>)
        : {};
    const expectedToken = resolveGoogleCalendarWebhookToken(cfg);
    const tokenCheck = verifyGoogleWebhookHeaders({
      channelId,
      channelToken: headers.channelToken,
      resourceState: headers.resourceState,
      expectedToken: expectedToken || undefined,
    });
    if (!tokenCheck.ok) {
      throw new BadRequestException(tokenCheck.reason ?? 'Token do canal inválido.');
    }

    const eventId = [
      channelId,
      headers.resourceId ?? '',
      headers.messageNumber ?? headers.resourceState ?? 'notify',
    ].join(':');
    const payloadHash = createHash('sha256')
      .update(JSON.stringify({
        channelId,
        resourceId: headers.resourceId ?? null,
        resourceState: headers.resourceState ?? null,
        messageNumber: headers.messageNumber ?? null,
      }))
      .digest('hex');

    try {
      await prisma.webhookReceipt.create({
        data: {
          provider: 'GOOGLE_CALENDAR',
          eventId: eventId.slice(0, 190),
          payloadHash,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: true, duplicate: true, message: 'Webhook já processado.' };
      }
      throw error;
    }

    if (tokenCheck.syncOnly) {
      await prisma.webhookReceipt.update({
        where: { provider_eventId: { provider: 'GOOGLE_CALENDAR', eventId: eventId.slice(0, 190) } },
        data: { status: 'SUCCEEDED', processedAt: new Date() },
      });
      return { success: true, syncOnly: true, message: 'Handshake sync ACK.' };
    }

    try {
      const result = await this.pullGoogleCalendarSync(match.clinic.organizationId, match.id);
      await prisma.webhookReceipt.update({
        where: { provider_eventId: { provider: 'GOOGLE_CALENDAR', eventId: eventId.slice(0, 190) } },
        data: { status: 'SUCCEEDED', processedAt: new Date() },
      });
      return {
        success: true,
        connectionId: match.id,
        pull: result,
        message: 'Notify processado com pull-sync.',
      };
    } catch (error) {
      await prisma.webhookReceipt.update({
        where: { provider_eventId: { provider: 'GOOGLE_CALENDAR', eventId: eventId.slice(0, 190) } },
        data: { status: 'FAILED', processedAt: new Date() },
      });
      throw error;
    }
  }

  /**
   * Indica se a clínica tem Google Calendar utilizável (OAuth live, sem mock).
   * Usado pela agenda para exibir o toggle de eventos pessoais.
   */
  async googleCalendarClinicAvailability(organizationId: string, clinicId: string) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, organizationId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');

    if (isGoogleCalendarMock()) {
      return {
        available: false as const,
        connected: false,
        reason: 'mock' as const,
        message: 'Google Agenda está em modo demonstração. Conecte em produção para ver eventos pessoais.',
      };
    }

    const connection = await this.findGoogleCalendarConnection(clinicId);
    if (!connection?.encryptedCredentials) {
      return {
        available: false as const,
        connected: false,
        reason: 'not_connected' as const,
        message: 'Google Agenda não está conectada nesta clínica.',
      };
    }

    const credentials = this.decryptForAdapter(connection.encryptedCredentials);
    if (!resolveGoogleOAuthCredentials(credentials) || !tokensFromCredentials(credentials)) {
      return {
        available: false as const,
        connected: true,
        reason: 'oauth_incomplete' as const,
        message: 'Google Agenda conectada, mas falta concluir a autorização.',
      };
    }

    return {
      available: true as const,
      connected: true,
      reason: 'ready' as const,
      message: 'Google Agenda pronta para avisos e visualização de eventos pessoais.',
      connectionId: connection.id,
    };
  }

  /**
   * Lista eventos pessoais (não sincronizados pela clínica) no intervalo.
   * Falhas de OAuth/API retornam lista vazia — nunca derruba a agenda.
   */
  async listPersonalGoogleEvents(
    organizationId: string,
    clinicId: string,
    from: string,
    to: string,
    professionalId?: string,
  ): Promise<{ available: boolean; events: PersonalCalendarEventDto[]; message?: string }> {
    const timeMin = new Date(from);
    const timeMax = new Date(to);
    if (!Number.isFinite(timeMin.getTime()) || !Number.isFinite(timeMax.getTime()) || timeMin >= timeMax) {
      throw new BadRequestException('Informe um intervalo from/to válido.');
    }

    const availability = await this.googleCalendarClinicAvailability(organizationId, clinicId);
    if (!availability.available) {
      return { available: false, events: [], message: availability.message };
    }

    try {
      const ctx = await this.openGoogleCalendarContext(organizationId, clinicId, professionalId);
      if (!ctx) {
        return { available: false, events: [], message: 'Google Agenda indisponível no momento.' };
      }

      const remote = await listGoogleCalendarEvents(ctx.accessToken, ctx.calendarId, { timeMin, timeMax });
      const clinicSyncedIds = await this.clinicSyncedExternalEventIds(organizationId, clinicId, timeMin, timeMax);
      const events = remote
        .filter((event) => this.isPersonalGoogleEvent(event, clinicSyncedIds))
        .map((event): PersonalCalendarEventDto => ({
          id: event.id,
          summary: event.summary,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt.toISOString(),
          allDay: event.allDay,
          source: 'google_personal',
        }));

      return { available: true, events };
    } catch {
      return {
        available: true,
        events: [],
        message: 'Não foi possível carregar eventos pessoais do Google agora.',
      };
    }
  }

  /**
   * Avisos não bloqueantes quando o horário proposto sobrepõe evento pessoal do Google.
   */
  async findPersonalCalendarWarnings(
    organizationId: string,
    input: {
      clinicId: string;
      professionalId?: string;
      startAt: string;
      endAt: string;
      excludeAppointmentId?: string;
    },
  ): Promise<PersonalCalendarWarning[]> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || startAt >= endAt) {
      return [];
    }

    try {
      const availability = await this.googleCalendarClinicAvailability(organizationId, input.clinicId);
      if (!availability.available) return [];

      const ctx = await this.openGoogleCalendarContext(
        organizationId,
        input.clinicId,
        input.professionalId,
      );
      if (!ctx) return [];

      const remote = await listGoogleCalendarEvents(ctx.accessToken, ctx.calendarId, {
        timeMin: startAt,
        timeMax: endAt,
      });
      const clinicSyncedIds = await this.clinicSyncedExternalEventIds(
        organizationId,
        input.clinicId,
        startAt,
        endAt,
        input.excludeAppointmentId,
      );

      const warnings: PersonalCalendarWarning[] = [];
      for (const event of remote) {
        if (!this.isPersonalGoogleEvent(event, clinicSyncedIds)) continue;
        if (!rangesOverlap(startAt, endAt, event.startAt, event.endAt)) continue;
        warnings.push({
          type: 'personal_calendar',
          message: `Conflito com agenda pessoal: “${event.summary}”. Você pode agendar mesmo assim.`,
          eventId: event.id,
          summary: event.summary,
          startAt: event.startAt.toISOString(),
          endAt: event.endAt.toISOString(),
        });
      }
      return warnings;
    } catch {
      return [];
    }
  }

  /** Usado por test-connection quando já há refresh_token. */
  async probeGoogleCalendarLive(connectionId: string, credentials: Record<string, string>, configuration: unknown) {
    const status = this.googleCalendarOauthStatus(undefined, connectionId, credentials, configuration);
    if (!status.oauthReady) return status;
    const oauth = resolveGoogleOAuthCredentials(credentials)!;
    const fresh = await ensureFreshAccessToken(oauth, credentials);
    if (fresh.refreshed) {
      await prisma.integrationConnection.update({
        where: { id: connectionId },
        data: { encryptedCredentials: this.encrypt(fresh.credentials), lastSyncAt: new Date() },
      });
    }
    const calendarId = readCalendarId(configuration);
    const probe = await testGoogleCalendarAccess(fresh.accessToken, calendarId);
    if (probe.success) {
      await prisma.integrationConnection.update({
        where: { id: connectionId },
        data: { lastSyncAt: new Date(), status: 'ACTIVE' },
      });
    }
    return {
      ...probe,
      provider: 'GOOGLE_CALENDAR' as const,
      connectionId,
      enabled: true,
      oauthReady: true,
      syncBidirectional: true,
      calendarId,
      status: probe.success ? 'READY' : 'ERROR',
      mode: 'live',
    };
  }

  async save(organizationId: string, actorId: string, input: SaveConnectionInput) {
    const clinic = await prisma.clinic.findFirst({ where: { id: input.clinicId, organizationId } });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
    const provider = input.provider;
    const schema = providerCredentials[provider] as z.ZodType<Record<string, string>>;
    let credentials = parseWithZod(schema, input.credentials);
    const scopeType = input.scopeType ?? process.env.INTEGRATION_SCOPE_DEFAULT ?? 'CLINIC';
    const scopeId = input.scopeId ?? input.clinicId;

    if (provider === 'GOOGLE_CALENDAR') {
      const existing = await prisma.integrationConnection.findUnique({
        where: {
          clinicId_provider_scopeType_scopeId: {
            clinicId: input.clinicId, provider, scopeType, scopeId,
          },
        },
        select: { encryptedCredentials: true },
      });
      if (existing?.encryptedCredentials) {
        const previous = this.decryptForAdapter(existing.encryptedCredentials);
        const tokens = tokensFromCredentials(previous);
        if (tokens) {
          credentials = mergeTokenCredentials(credentials, tokens);
        }
      }
    }

    const encryptedCredentials = this.encrypt(credentials);

    return prisma.$transaction(async (tx) => {
      const existingRow = await tx.integrationConnection.findUnique({
        where: {
          clinicId_provider_scopeType_scopeId: {
            clinicId: input.clinicId, provider, scopeType, scopeId,
          },
        },
        select: { configuration: true },
      });
      const prevConfig =
        existingRow?.configuration && typeof existingRow.configuration === 'object' && !Array.isArray(existingRow.configuration)
          ? (existingRow.configuration as Record<string, unknown>)
          : {};
      const nextConfiguration = {
        ...prevConfig,
        ...(input.configuration ?? {}),
      };
      // Não reintroduzir state OAuth pendente ao salvar credenciais.
      delete nextConfiguration.pendingOauthState;
      delete nextConfiguration.pendingOauthAt;

      const connection = await tx.integrationConnection.upsert({
        where: {
          clinicId_provider_scopeType_scopeId: {
            clinicId: input.clinicId, provider, scopeType, scopeId,
          },
        },
        update: {
          encryptedCredentials,
          configuration: json(nextConfiguration),
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

  private async findGoogleCalendarConnection(clinicId: string, professionalId?: string) {
    if (professionalId) {
      const professionalScoped = await prisma.integrationConnection.findFirst({
        where: {
          clinicId,
          provider: 'GOOGLE_CALENDAR',
          status: 'ACTIVE',
          encryptedCredentials: { not: null },
          scopeType: 'PROFESSIONAL',
          scopeId: professionalId,
        },
      });
      if (professionalScoped) return professionalScoped;
    }

    return prisma.integrationConnection.findFirst({
      where: {
        clinicId,
        provider: 'GOOGLE_CALENDAR',
        status: 'ACTIVE',
        encryptedCredentials: { not: null },
        OR: [
          { scopeType: 'CLINIC' },
          { scopeType: { not: 'PROFESSIONAL' } },
        ],
      },
      orderBy: { lastSyncAt: 'desc' },
    });
  }

  private async openGoogleCalendarContext(
    organizationId: string,
    clinicId: string,
    professionalId?: string,
  ): Promise<{ accessToken: string; calendarId: string; connectionId: string } | null> {
    if (isGoogleCalendarMock()) return null;
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, organizationId },
      select: { id: true },
    });
    if (!clinic) return null;

    const connection = await this.findGoogleCalendarConnection(clinicId, professionalId);
    if (!connection?.encryptedCredentials) return null;

    let credentials = this.decryptForAdapter(connection.encryptedCredentials);
    const oauth = resolveGoogleOAuthCredentials(credentials);
    if (!oauth || !tokensFromCredentials(credentials)) return null;

    const fresh = await ensureFreshAccessToken(oauth, credentials);
    if (fresh.refreshed) {
      credentials = fresh.credentials;
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { encryptedCredentials: this.encrypt(credentials) },
      });
    }

    return {
      accessToken: fresh.accessToken,
      calendarId: readCalendarId(connection.configuration),
      connectionId: connection.id,
    };
  }

  private async clinicSyncedExternalEventIds(
    organizationId: string,
    clinicId: string,
    timeMin: Date,
    timeMax: Date,
    excludeAppointmentId?: string,
  ): Promise<Set<string>> {
    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId,
        clinicId,
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        externalCalendarEventId: { not: null },
        startAt: { lt: timeMax },
        endAt: { gt: timeMin },
      },
      select: { externalCalendarEventId: true },
      take: 500,
    });
    return new Set(
      appointments
        .map((item) => item.externalCalendarEventId)
        .filter((value): value is string => Boolean(value)),
    );
  }

  private isPersonalGoogleEvent(
    event: GoogleCalendarListedEvent,
    clinicSyncedIds: Set<string>,
  ): boolean {
    if (isSonderClinicSyncedEvent(event)) return false;
    if (clinicSyncedIds.has(event.id)) return false;
    return true;
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

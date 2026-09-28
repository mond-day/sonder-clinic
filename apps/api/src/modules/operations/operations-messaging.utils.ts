import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  prisma,
  renderMessageTemplateText,
  type MessageTemplateVariable,
} from '@sonder/database';
import { z } from 'zod';
import { assertSmtpConfigured, sendMail } from '../../common/mail';
import { parseWithZod } from '../../common/zod-validation';
import { decryptCredentialsPayload } from '../../integrations/credentials';
import { isChatwootMock, resolveChatwootConfig, sendChatwootText } from '../../integrations/chatwoot';

const json = (value: unknown) => value as Prisma.InputJsonValue;

const channelType = z.enum(['EMAIL', 'WHATSAPP', 'SMS']);
export const createChannelSchema = z
  .object({
    clinicId: z.string().uuid().optional(),
    type: channelType,
    displayName: z.string().trim().min(2).max(120),
    integrationConnectionId: z.string().uuid().optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'WHATSAPP' && !value.integrationConnectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['integrationConnectionId'],
        message: 'Canal WhatsApp precisa de uma integração conectada (Configurações → Integrações).',
      });
    }
    if (value.type !== 'WHATSAPP' && value.integrationConnectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['integrationConnectionId'],
        message: 'Só canais WhatsApp usam integração de terceiros.',
      });
    }
  });
export const updateChannelSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  integrationConnectionId: z.string().uuid().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const MESSAGING_PROVIDERS = ['EVOLUTION', 'CHATWOOT'] as const;
const NOT_CONNECTED_MESSAGE =
  'Integração não encontrada ou não conectada. Conecte Evolution ou Chatwoot em Configurações → Integrações.';

/** Integração de mensageria da organização que está ativa e com credenciais salvas. */
function findConnectedMessagingIntegration(organizationId: string, id: string) {
  return prisma.integrationConnection.findFirst({
    where: {
      id,
      clinic: { organizationId },
      provider: { in: [...MESSAGING_PROVIDERS] },
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
    select: { id: true, clinicId: true, provider: true, configuration: true, encryptedCredentials: true },
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
const sendManualSchema = z.object({
  channelId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  recipient: z.string().trim().min(3).max(200).optional(),
  content: z.string().trim().min(1).max(4000).optional(),
  category: z.string().trim().max(60).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
  delayMs: number;
  minIntervalMs: number;
};

const DEFAULT_DELAY_MS = 1500;
const DEFAULT_MIN_INTERVAL_MS = 4000;
const sendChainByInstance = new Map<string, Promise<void>>();
const lastSentAtByInstance = new Map<string, number>();

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readBoundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function evolutionSendPacing(source: Record<string, unknown>) {
  return {
    delayMs: readBoundedInt(
      source.delayMs ?? source.delay ?? process.env.EVOLUTION_SEND_DELAY_MS,
      DEFAULT_DELAY_MS,
      0,
      15_000,
    ),
    minIntervalMs: readBoundedInt(
      source.minIntervalMs ?? source.minInterval ?? process.env.EVOLUTION_MIN_INTERVAL_MS,
      DEFAULT_MIN_INTERVAL_MS,
      0,
      60_000,
    ),
  };
}

async function waitEvolutionSendSlot(instance: string, minIntervalMs: number) {
  if (minIntervalMs <= 0) return;
  const previous = sendChainByInstance.get(instance) ?? Promise.resolve();
  const turn = previous.catch(() => undefined).then(async () => {
    const elapsed = Date.now() - (lastSentAtByInstance.get(instance) ?? 0);
    const wait = minIntervalMs - elapsed;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSentAtByInstance.set(instance, Date.now());
  });
  sendChainByInstance.set(instance, turn.then(() => undefined));
  await turn;
}

/** Resolve Evolution a partir de env + configuration (+ credentials opcionais). */
export function resolveEvolutionConfig(
  channelConfiguration: unknown,
  credentials?: Record<string, string>,
): EvolutionConfig | null {
  const settings =
    channelConfiguration && typeof channelConfiguration === 'object' && !Array.isArray(channelConfiguration)
      ? (channelConfiguration as Record<string, unknown>)
      : {};
  const creds = credentials ?? {};
  const baseUrl = pickString(
    process.env.EVOLUTION_BASE_URL,
    creds.baseUrl,
    creds.EVOLUTION_BASE_URL,
    creds.BASE_URL,
    settings.baseUrl,
    settings.EVOLUTION_BASE_URL,
    settings.BASE_URL,
  ).replace(/\/+$/, '');
  const apiKey = pickString(
    process.env.EVOLUTION_API_KEY,
    creds.apiKey,
    creds.EVOLUTION_API_KEY,
    creds.API_KEY,
    settings.apiKey,
    settings.EVOLUTION_API_KEY,
    settings.API_KEY,
  );
  const instance = pickString(
    process.env.EVOLUTION_INSTANCE,
    creds.instance,
    creds.instanceName,
    creds.EVOLUTION_INSTANCE,
    settings.instance,
    settings.instanceName,
    settings.EVOLUTION_INSTANCE,
  );
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl, apiKey, instance, ...evolutionSendPacing({ ...settings, ...creds }) };
}

async function sendEvolutionWhatsApp(config: EvolutionConfig, number: string, text: string) {
  await waitEvolutionSendSlot(config.instance, config.minIntervalMs);
  const response = await fetch(
    `${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number, text, delay: config.delayMs }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error(`Evolution respondeu HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
}

export function renderMessageTemplate(
  content: string,
  variables: Partial<Record<MessageTemplateVariable, string>>,
): string {
  return renderMessageTemplateText(content, variables);
}

/** "Unidade Centro · Rua X, 10 · Cuiabá" com o que estiver cadastrado. */
export function formatUnitAddress(unit: { name: string; address?: string | null; city?: string | null } | null | undefined): string {
  if (!unit) return '';
  const address = unit.address?.trim();
  const city = unit.city?.trim();
  if (address) return [address, city].filter(Boolean).join(' · ');
  return [unit.name?.trim(), city].filter(Boolean).join(' · ');
}

/**
 * Próxima consulta do paciente para preencher data/horário/profissional/endereço
 * em envios manuais; sem consulta futura, mantém data de hoje e campos vazios.
 */
async function nextAppointmentVariables(organizationId: string, patientId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      organizationId,
      patientId,
      startAt: { gte: new Date() },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    orderBy: { startAt: 'asc' },
    select: {
      startAt: true,
      professional: { select: { name: true } },
      unit: { select: { name: true, address: true, city: true, timezone: true } },
    },
  });
  if (!appointment) return null;
  const timeZone = appointment.unit.timezone || 'America/Cuiaba';
  return {
    date: new Intl.DateTimeFormat('pt-BR', { timeZone }).format(appointment.startAt),
    appointmentTime: new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(appointment.startAt),
    professionalName: appointment.professional.name,
    clinicAddress: formatUnitAddress(appointment.unit),
  };
}

export function listMessagingChannels(organizationId: string, includeInactive = false) {
  return prisma.messagingChannel.findMany({
    where: {
      organizationId,
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
    },
    orderBy: [{ type: 'asc' }, { displayName: 'asc' }],
  });
}

export async function createMessagingChannel(
  organizationId: string,
  input: z.input<typeof createChannelSchema>,
) {
  const data = parseWithZod(createChannelSchema, input);
  if (data.clinicId) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: data.clinicId, organizationId },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Clínica não encontrada.');
  }
  let clinicId = data.clinicId;
  let configuration = data.configuration ?? {};
  if (data.integrationConnectionId) {
    const connection = await findConnectedMessagingIntegration(organizationId, data.integrationConnectionId);
    if (!connection) throw new BadRequestException(NOT_CONNECTED_MESSAGE);
    if (clinicId && connection.clinicId !== clinicId) {
      throw new BadRequestException('A integração escolhida pertence a outra clínica.');
    }
    clinicId = connection.clinicId;
    configuration = { ...configuration, provider: connection.provider };
  }
  return prisma.messagingChannel.create({
    data: {
      organizationId,
      clinicId,
      type: data.type,
      displayName: data.displayName,
      integrationConnectionId: data.integrationConnectionId ?? null,
      configuration: json(configuration),
      status: 'ACTIVE',
    },
  });
}

export async function updateMessagingChannel(
  organizationId: string,
  id: string,
  input: z.input<typeof updateChannelSchema>,
) {
  const data = parseWithZod(updateChannelSchema, input);
  const existing = await prisma.messagingChannel.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundException('Canal não encontrado.');
  let clinicId: string | undefined;
  let configuration = data.configuration;
  if (data.integrationConnectionId) {
    if (existing.type !== 'WHATSAPP') {
      throw new BadRequestException('Só canais WhatsApp usam integração de terceiros.');
    }
    const connection = await findConnectedMessagingIntegration(organizationId, data.integrationConnectionId);
    if (!connection) throw new BadRequestException(NOT_CONNECTED_MESSAGE);
    if (existing.clinicId && connection.clinicId !== existing.clinicId) {
      throw new BadRequestException('A integração escolhida pertence a outra clínica.');
    }
    clinicId = connection.clinicId;
    configuration = {
      ...asObject(existing.configuration),
      ...(data.configuration ?? {}),
      provider: connection.provider,
    };
  }
  return prisma.messagingChannel.update({
    where: { id },
    data: {
      displayName: data.displayName,
      clinicId,
      integrationConnectionId: data.integrationConnectionId,
      configuration: configuration === undefined ? undefined : json(configuration),
      status: data.status,
    },
  });
}

async function resolveRecipient(input: {
  organizationId: string;
  patientId?: string;
  channelType: string;
  recipient?: string;
}): Promise<{ recipient: string; patientId?: string }> {
  if (input.recipient?.trim()) {
    return { recipient: input.recipient.trim(), patientId: input.patientId };
  }
  if (!input.patientId) {
    throw new BadRequestException('Informe recipient ou patientId.');
  }
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, organizationId: input.organizationId },
    select: { id: true, primaryPhone: true, email: true, fullName: true },
  });
  if (!patient) throw new NotFoundException('Paciente não encontrado.');
  if (input.channelType === 'EMAIL') {
    if (!patient.email?.trim()) {
      throw new BadRequestException('Paciente sem e-mail cadastrado.');
    }
    return { recipient: patient.email.trim(), patientId: patient.id };
  }
  if (!patient.primaryPhone?.trim()) {
    throw new BadRequestException('Paciente sem telefone cadastrado.');
  }
  return { recipient: patient.primaryPhone.trim(), patientId: patient.id };
}

async function assertConsentIfNeeded(input: {
  organizationId: string;
  patientId?: string;
  channelType: string;
  category: string;
  requiresConsent: boolean;
}) {
  if (!input.requiresConsent || !input.patientId) return;
  const pref = await prisma.communicationPreference.findUnique({
    where: {
      organizationId_patientId_channel_category: {
        organizationId: input.organizationId,
        patientId: input.patientId,
        channel: input.channelType,
        category: input.category,
      },
    },
  });
  if (pref && !pref.optedIn) {
    throw new BadRequestException(
      `Paciente optou por não receber ${input.category} via ${input.channelType}.`,
    );
  }
}

async function loadConnection(
  clinicId: string,
  provider: 'EVOLUTION' | 'CHATWOOT',
) {
  return prisma.integrationConnection.findFirst({
    where: {
      clinicId,
      provider,
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
    select: { encryptedCredentials: true, configuration: true },
  });
}

function channelTransport(configuration: unknown): 'CHATWOOT' | 'EVOLUTION' | null {
  const settings =
    configuration && typeof configuration === 'object' && !Array.isArray(configuration)
      ? (configuration as Record<string, unknown>)
      : {};
  const provider = pickString(settings.provider, settings.transport).toUpperCase();
  if (provider === 'CHATWOOT') return 'CHATWOOT';
  if (provider === 'EVOLUTION') return 'EVOLUTION';
  return null;
}

/**
 * Envio manual controlado.
 * EMAIL → SMTP real (falha se SMTP_HOST ausente).
 * WHATSAPP → Evolution ou Chatwoot (mesmo delivery; canal escolhe o transporte).
 * SMS → stub honesto (FAILED).
 */
export async function sendManualMessage(
  organizationId: string,
  _actorId: string,
  input: z.input<typeof sendManualSchema>,
) {
  const data = parseWithZod(sendManualSchema, input);
  const channel = await prisma.messagingChannel.findFirst({
    where: { id: data.channelId, organizationId, status: 'ACTIVE' },
  });
  if (!channel) throw new NotFoundException('Canal ativo não encontrado.');

  let templateContent: string | null = null;
  let templateId: string | undefined;
  let requiresConsent = true;
  let category = (data.category ?? 'OTHER').toUpperCase();

  if (data.templateId) {
    const template = await prisma.messageTemplate.findFirst({
      where: { id: data.templateId, organizationId, active: true },
    });
    if (!template) throw new NotFoundException('Template não encontrado.');
    templateContent = template.content;
    templateId = template.id;
    requiresConsent = template.requiresConsent;
    category = template.category;
  }

  if (!templateContent && !data.content?.trim()) {
    throw new BadRequestException('Informe templateId ou content.');
  }

  const { recipient, patientId } = await resolveRecipient({
    organizationId,
    patientId: data.patientId,
    channelType: channel.type,
    recipient: data.recipient,
  });

  await assertConsentIfNeeded({
    organizationId,
    patientId,
    channelType: channel.type,
    category,
    requiresConsent,
  });

  const vars: Record<MessageTemplateVariable, string> = {
    patientName: '',
    date: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba' }).format(new Date()),
    clinicName: '',
    professionalName: '',
    clinicAddress: '',
    appointmentTime: '',
  };

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { fullName: true },
    });
    if (patient) vars.patientName = patient.fullName;
    Object.assign(vars, await nextAppointmentVariables(organizationId, patientId));
  }
  if (channel.clinicId) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: channel.clinicId, organizationId },
      select: {
        tradeName: true,
        units: {
          where: { status: 'ACTIVE' },
          select: { name: true, address: true, city: true },
          orderBy: { name: 'asc' },
          take: 1,
        },
      },
    });
    if (clinic) {
      vars.clinicName = clinic.tradeName;
      if (!vars.clinicAddress) vars.clinicAddress = formatUnitAddress(clinic.units[0]);
    }
  }
  for (const [key, value] of Object.entries(data.variables ?? {})) {
    if (key in vars && !vars[key as MessageTemplateVariable]) vars[key as MessageTemplateVariable] = value;
  }

  const rendered = renderMessageTemplate(templateContent ?? data.content!, vars);

  const delivery = await prisma.messageDelivery.create({
    data: {
      organizationId,
      patientId,
      channelId: channel.id,
      templateId,
      recipient,
      renderedContent: rendered,
      status: 'PENDING',
    },
  });

  try {
    if (channel.type === 'EMAIL') {
      assertSmtpConfigured();
      await sendMail({
        to: recipient,
        subject: `Sonder Clinic · ${category}`,
        text: rendered,
      });
      return prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', sentAt: new Date(), error: null },
      });
    }

    // WHATSAPP / SMS — mesmo delivery; transporte Evolution ou Chatwoot.
    if (channel.type === 'WHATSAPP') {
      const linked = channel.integrationConnectionId
        ? await findConnectedMessagingIntegration(organizationId, channel.integrationConnectionId)
        : null;
      if (channel.integrationConnectionId && !linked) {
        return prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            error: 'A integração vinculada ao canal não está conectada. Revise em Configurações → Integrações.',
          },
        });
      }
      const connectionFor = async (provider: 'EVOLUTION' | 'CHATWOOT') => {
        if (linked) return linked.provider === provider ? linked : null;
        return channel.clinicId ? loadConnection(channel.clinicId, provider) : null;
      };
      const preferred = linked
        ? (linked.provider as 'EVOLUTION' | 'CHATWOOT')
        : channelTransport(channel.configuration);
      const evolutionMock = (process.env.EVOLUTION_MOCK ?? 'true').toLowerCase() === 'true';
      let evolution = preferred === 'CHATWOOT' || linked ? null : resolveEvolutionConfig(channel.configuration);
      let chatwoot = preferred === 'EVOLUTION' || linked ? null : resolveChatwootConfig(undefined, channel.configuration);

      if (!evolution && preferred !== 'CHATWOOT') {
        const connection = await connectionFor('EVOLUTION');
        if (connection?.encryptedCredentials) {
          try {
            const creds = decryptCredentialsPayload(connection.encryptedCredentials);
            evolution = resolveEvolutionConfig(connection.configuration, creds);
          } catch {
            evolution = null;
          }
        }
      }
      if ((!chatwoot || !chatwoot.inboxId) && preferred !== 'EVOLUTION') {
        const connection = await connectionFor('CHATWOOT');
        if (connection?.encryptedCredentials) {
          try {
            const creds = decryptCredentialsPayload(connection.encryptedCredentials);
            const merged = { ...asObject(connection.configuration), ...asObject(channel.configuration) };
            chatwoot = resolveChatwootConfig(creds, merged);
          } catch {
            /* mantém o config do canal, se houver */
          }
        }
      }

      const digits = recipient.replace(/\D/g, '');
      const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
      if (withCountry.length < 10) {
        return prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', error: 'Telefone inválido para WhatsApp.' },
        });
      }

      const evolutionLive = Boolean(evolution) && !evolutionMock;
      const useChatwoot = preferred === 'CHATWOOT'
        || (preferred !== 'EVOLUTION' && !evolutionLive && Boolean(chatwoot));
      if (useChatwoot) {
        if (isChatwootMock() || !chatwoot) {
          const reason = isChatwootMock()
            ? 'WhatsApp não enviado: CHATWOOT_MOCK=true (stub). Delivery marcada como FAILED.'
            : 'WhatsApp não enviado: configure Chatwoot (base URL, token, account id e inbox id).';
          return prisma.messageDelivery.update({
            where: { id: delivery.id },
            data: { status: 'FAILED', error: reason },
          });
        }
        try {
          const sent = await sendChatwootText(chatwoot, {
            phone: recipient,
            name: vars.patientName || undefined,
            text: rendered,
          });
          return prisma.messageDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              error: null,
              externalId: sent.conversationId,
            },
          });
        } catch (sendError) {
          const detail = sendError instanceof Error ? sendError.message : 'Falha Chatwoot.';
          return prisma.messageDelivery.update({
            where: { id: delivery.id },
            data: { status: 'FAILED', error: detail },
          });
        }
      }

      if (evolutionMock || !evolution) {
        const reason = evolutionMock
          ? 'WhatsApp não enviado: EVOLUTION_MOCK=true (stub). Delivery marcada como FAILED.'
          : 'WhatsApp não enviado: configure Evolution ou Chatwoot (env, canal ou integração).';
        return prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', error: reason },
        });
      }
      try {
        await sendEvolutionWhatsApp(evolution, withCountry, rendered);
        return prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date(), error: null },
        });
      } catch (sendError) {
        const detail = sendError instanceof Error ? sendError.message : 'Falha Evolution.';
        return prisma.messageDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', error: detail },
        });
      }
    }

    return prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        error: 'Canal SMS outbound ainda não implementado (stub honesto).',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha no envio.';
    await prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: detail },
    });
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
    throw new BadRequestException(detail);
  }
}

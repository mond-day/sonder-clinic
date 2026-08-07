import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, prisma } from '@sonder/database';
import { z } from 'zod';
import { assertSmtpConfigured, sendMail } from '../../common/mail';
import { parseWithZod } from '../../common/zod-validation';

const json = (value: unknown) => value as Prisma.InputJsonValue;

const TEMPLATE_VARS = ['patientName', 'date', 'clinicName', 'professionalName'] as const;

const channelType = z.enum(['EMAIL', 'WHATSAPP', 'SMS']);
const createChannelSchema = z.object({
  clinicId: z.string().uuid().optional(),
  type: channelType,
  displayName: z.string().trim().min(2).max(120),
  configuration: z.record(z.string(), z.unknown()).optional(),
});
const updateChannelSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
const sendManualSchema = z.object({
  channelId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  recipient: z.string().trim().min(3).max(200).optional(),
  content: z.string().trim().min(1).max(4000).optional(),
  category: z.string().trim().max(60).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export function renderMessageTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    if (!(TEMPLATE_VARS as readonly string[]).includes(key as typeof TEMPLATE_VARS[number])) {
      return `{{${key}}}`;
    }
    return variables[key] ?? '';
  });
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
  return prisma.messagingChannel.create({
    data: {
      organizationId,
      clinicId: data.clinicId,
      type: data.type,
      displayName: data.displayName,
      configuration: json(data.configuration ?? {}),
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
  return prisma.messagingChannel.update({
    where: { id },
    data: {
      displayName: data.displayName,
      configuration: data.configuration === undefined ? undefined : json(data.configuration),
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

/**
 * Envio manual controlado.
 * EMAIL → SMTP real (falha se SMTP_HOST ausente).
 * WHATSAPP/SMS → stub honesto (registra FAILED se Evolution MOCK/ausente).
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

  const vars: Record<string, string> = {
    patientName: '',
    date: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba' }).format(new Date()),
    clinicName: '',
    professionalName: '',
    ...(data.variables ?? {}),
  };

  if (patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { fullName: true },
    });
    if (patient) vars.patientName = patient.fullName;
  }
  if (channel.clinicId) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: channel.clinicId, organizationId },
      select: { tradeName: true },
    });
    if (clinic) vars.clinicName = clinic.tradeName;
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

    // WHATSAPP / SMS — stub honesto
    const evolutionMock = (process.env.EVOLUTION_MOCK ?? 'true').toLowerCase() === 'true';
    const evolutionReady = Boolean(process.env.EVOLUTION_BASE_URL?.trim() && process.env.EVOLUTION_API_KEY?.trim());
    if (evolutionMock || !evolutionReady) {
      const reason = evolutionMock
        ? 'WhatsApp/SMS não enviado: EVOLUTION_MOCK=true (stub). Delivery marcada como FAILED.'
        : 'WhatsApp/SMS não enviado: configure EVOLUTION_BASE_URL e EVOLUTION_API_KEY.';
      return prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: { status: 'FAILED', error: reason },
      });
    }

    return prisma.messageDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        error: 'Evolution configurada, mas envio outbound ainda não está implementado no adapter (stub honesto).',
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

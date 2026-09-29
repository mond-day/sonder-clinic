import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  parseInboundReply,
  phonesMatch,
  Prisma,
  prisma,
  type InboundReplyIntent,
} from '@sonder/database';

/**
 * Respostas do paciente ao lembrete/confirmação via WhatsApp (Evolution ou Chatwoot).
 * Só altera o status da consulta vinculada; nunca envia mensagem de volta.
 */

const REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const logger = new Logger('WhatsAppInbound');

export type InboundWhatsAppMessage = { messageId: string; phone: string; text: string };

function masterKeyBuffer(secretHex = process.env.ENCRYPTION_MASTER_KEY): Buffer | null {
  if (!secretHex || !/^[a-f0-9]{64}$/i.test(secretHex)) return null;
  return Buffer.from(secretHex, 'hex');
}

export function whatsappWebhookToken(connectionId: string, secretHex?: string): string | null {
  const key = masterKeyBuffer(secretHex);
  if (!key) return null;
  return createHmac('sha256', key).update(`whatsapp-webhook:${connectionId}`).digest('base64url');
}

export function verifyWhatsappWebhookToken(connectionId: string, token: string | undefined, secretHex?: string): boolean {
  const expected = whatsappWebhookToken(connectionId, secretHex);
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Caminho relativo à API (sem host) para cadastrar no webhook do provedor. */
export function whatsappWebhookPath(connectionId: string): string | null {
  const token = whatsappWebhookToken(connectionId);
  return token ? `/integrations/whatsapp/webhook/${connectionId}?token=${token}` : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function jidPhone(jid: string | null): string | null {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  return jid.split('@')[0]?.split(':')[0] ?? null;
}

/** Evolution API: evento messages.upsert. Ignora mensagens enviadas pela clínica e grupos. */
export function readEvolutionInbound(payload: unknown): InboundWhatsAppMessage | null {
  const body = asRecord(payload);
  if (!body) return null;
  const event = String(body.event ?? '').toLowerCase().replace(/_/g, '.');
  if (event !== 'messages.upsert') return null;
  const data = asRecord(Array.isArray(body.data) ? body.data[0] : body.data);
  const key = asRecord(data?.key);
  if (!data || !key || key.fromMe === true) return null;
  const remoteJid = asText(key.remoteJid);
  const phone = jidPhone(remoteJid) ?? jidPhone(asText(key.remoteJidAlt)) ?? jidPhone(asText(key.senderPn));
  const message = asRecord(data.message);
  const text =
    asText(message?.conversation) ??
    asText(asRecord(message?.extendedTextMessage)?.text) ??
    asText(asRecord(message?.buttonsResponseMessage)?.selectedDisplayText) ??
    asText(asRecord(message?.templateButtonReplyMessage)?.selectedDisplayText) ??
    asText(asRecord(message?.listResponseMessage)?.title);
  const messageId = asText(key.id);
  if (!phone || !text || !messageId) return null;
  return { messageId, phone, text };
}

/** Chatwoot: evento message_created com mensagem recebida (incoming, não privada). */
export function readChatwootInbound(payload: unknown): InboundWhatsAppMessage | null {
  const body = asRecord(payload);
  if (!body || body.event !== 'message_created') return null;
  if (body.private === true) return null;
  if (body.message_type !== 'incoming' && body.message_type !== 0) return null;
  const sender = asRecord(body.sender);
  const conversationSender = asRecord(asRecord(asRecord(body.conversation)?.meta)?.sender);
  const phone = asText(sender?.phone_number) ?? asText(conversationSender?.phone_number);
  const text = asText(body.content);
  const messageId = body.id === undefined || body.id === null ? null : String(body.id);
  if (!phone || !text || !messageId) return null;
  return { messageId, phone, text };
}

export type WhatsAppReplyResult =
  | { handled: false; reason: 'ignored' | 'not-a-reply' | 'duplicate' | 'no-appointment' | 'unchanged' }
  | { handled: true; appointmentId: string; intent: InboundReplyIntent; status: 'CONFIRMED' | 'CANCELLED' };

export async function handleWhatsAppReply(input: {
  connectionId: string;
  token?: string;
  payload: unknown;
  now?: Date;
}): Promise<WhatsAppReplyResult> {
  if (!verifyWhatsappWebhookToken(input.connectionId, input.token)) {
    throw new UnauthorizedException('Token do webhook inválido.');
  }
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: input.connectionId, provider: { in: ['EVOLUTION', 'CHATWOOT'] }, status: 'ACTIVE' },
    select: { id: true, provider: true, clinicId: true },
  });
  if (!connection) throw new NotFoundException('Integração de WhatsApp não encontrada ou inativa.');

  const message =
    connection.provider === 'EVOLUTION' ? readEvolutionInbound(input.payload) : readChatwootInbound(input.payload);
  if (!message) return { handled: false, reason: 'ignored' };
  const intent = parseInboundReply(message.text);
  if (!intent) return { handled: false, reason: 'not-a-reply' };

  const receiptKey = { provider: connection.provider, eventId: `${connection.id}:${message.messageId}` };
  try {
    await prisma.webhookReceipt.create({
      data: {
        ...receiptKey,
        payloadHash: createHash('sha256').update(JSON.stringify(input.payload)).digest('hex'),
        status: 'PROCESSING',
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { handled: false, reason: 'duplicate' };
    }
    throw error;
  }

  const result = await applyReply(connection.clinicId, message, intent, input.now ?? new Date());
  await prisma.webhookReceipt.update({
    where: { provider_eventId: receiptKey },
    data: { status: 'SUCCEEDED', processedAt: new Date() },
  });
  // Sem telefone/texto (LGPD): só o bastante para diagnosticar "respondeu SIM e não confirmou".
  logger.log(JSON.stringify({
    event: 'whatsapp.reply',
    connectionId: connection.id,
    provider: connection.provider,
    intent,
    ...(result.handled
      ? { handled: true, appointmentId: result.appointmentId, status: result.status }
      : { handled: false, reason: result.reason }),
  }));
  return result;
}

async function applyReply(
  clinicId: string,
  message: InboundWhatsAppMessage,
  intent: InboundReplyIntent,
  now: Date,
): Promise<WhatsAppReplyResult> {
  const reminders = await prisma.appointmentReminder.findMany({
    where: {
      channel: { startsWith: 'WHATSAPP' },
      status: { in: ['SENT', 'SENDING'] },
      updatedAt: { gte: new Date(now.getTime() - REPLY_WINDOW_MS) },
      appointment: { clinicId, startAt: { gte: now }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    },
    orderBy: { appointment: { startAt: 'asc' } },
    take: 200,
    select: {
      appointment: {
        select: { id: true, status: true, patient: { select: { primaryPhone: true } } },
      },
    },
  });
  const appointment = reminders.find((item) => item.appointment.patient && phonesMatch(item.appointment.patient.primaryPhone, message.phone))?.appointment;
  if (!appointment) return { handled: false, reason: 'no-appointment' };

  const nextStatus = intent === 'CONFIRM' ? 'CONFIRMED' : 'CANCELLED';
  if (appointment.status === nextStatus) return { handled: false, reason: 'unchanged' };

  const replyExcerpt = message.text.slice(0, 60);
  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    await tx.appointmentStatusEvent.create({
      data: {
        appointmentId: appointment.id,
        previousStatus: appointment.status,
        nextStatus,
        reasonCode: 'PATIENT_WHATSAPP',
        reasonText: `Paciente respondeu "${replyExcerpt}" no WhatsApp.`,
      },
    });
    if (nextStatus === 'CANCELLED') {
      await tx.appointmentReminder.updateMany({
        where: { appointmentId: appointment.id, status: 'PENDING' },
        data: { status: 'DISABLED', statusReason: 'Consulta cancelada pelo paciente via WhatsApp.' },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'Appointment',
          aggregateId: appointment.id,
          eventType: 'appointment.calendar-sync.requested',
          payload: { appointmentId: appointment.id, action: 'DELETE' },
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: null,
        action: 'appointment.whatsapp_reply',
        entity: 'Appointment',
        entityId: appointment.id,
        clinicId,
        changes: { intent, previousStatus: appointment.status, nextStatus, reply: replyExcerpt },
        correlationId: randomUUID(),
      },
    });
  });
  return { handled: true, appointmentId: appointment.id, intent, status: nextStatus };
}

import { createDecipheriv } from 'node:crypto';
import { prisma } from '@sonder/database';
import { readEvolutionConfiguration, sendEvolutionText } from './evolution';

const WHATSAPP_REMINDER_EVENT = 'appointment.whatsapp-reminder.requested';
const APPOINTMENT_COMPLETED_EVENT = 'appointment.completed';
const MAX_ATTEMPTS = 5;

type OutboxEvent = {
  id: string;
  eventType: string;
  aggregateId: string;
  attempts: number;
  payload: unknown;
};

function decryptCredentials(payload: string): Record<string, string> {
  const keyValue = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyValue || !/^[a-f0-9]{64}$/i.test(keyValue)) {
    throw new Error('ENCRYPTION_MASTER_KEY ausente ou inválida no worker.');
  }
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Credencial Evolution criptografada inválida.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyValue, 'hex'),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const parsed: unknown = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8'),
  );
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Credencial Evolution descriptografada inválida.');
  }
  const credentials = Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim().length > 0,
    ),
  );
  if (!Object.keys(credentials).length) {
    throw new Error('Credencial Evolution descriptografada está vazia.');
  }
  return credentials;
}

function normalizeWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  const withCountryCode = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (withCountryCode.length < 10 || withCountryCode.length > 15) {
    throw new Error('Paciente sem telefone válido para WhatsApp.');
  }
  return withCountryCode;
}

function reminderMessage(reminder: {
  appointment: {
    startAt: Date;
    patient: { fullName: string; preferredName: string | null };
    professional: { name: string };
    clinic: { tradeName: string };
    unit: { timezone: string };
  };
}): string {
  const { appointment } = reminder;
  const date = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: appointment.unit.timezone,
  }).format(appointment.startAt);
  const patientName = appointment.patient.preferredName ?? appointment.patient.fullName;
  return `Olá, ${patientName}! Lembramos do seu atendimento na ${appointment.clinic.tradeName} em ${date}, com ${appointment.professional.name}.`;
}

async function skipReminder(event: OutboxEvent, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.appointmentReminder.updateMany({
      where: { id: event.aggregateId },
      data: { status: 'DISABLED', statusReason: reason },
    }),
    prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: reason.slice(0, 500),
      },
    }),
  ]);
}

async function processWhatsAppReminder(event: OutboxEvent): Promise<void> {
  const reminder = await prisma.appointmentReminder.findUnique({
    where: { id: event.aggregateId },
    include: {
      appointment: {
        include: {
          patient: true,
          professional: true,
          clinic: true,
          unit: true,
        },
      },
    },
  });
  if (!reminder) {
    await skipReminder(event, 'Lembrete não encontrado; evento descartado.');
    return;
  }
  if (reminder.scheduledFor > new Date()) return;
  if (reminder.status === 'SENT' || reminder.status === 'DISABLED') {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: reminder.statusReason,
      },
    });
    return;
  }
  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reminder.appointment.status)) {
    await skipReminder(
      event,
      `Lembrete não enviado: agendamento ${reminder.appointment.status.toLowerCase()}.`,
    );
    return;
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      clinicId: reminder.appointment.clinicId,
      provider: 'EVOLUTION',
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
  });
  if (!connection?.encryptedCredentials) {
    await skipReminder(event, 'Evolution não configurado ou conexão desativada.');
    return;
  }
  if (process.env.EVOLUTION_MOCK === 'true') {
    await skipReminder(event, 'Evolution está em modo mock; nenhum WhatsApp foi enviado.');
    return;
  }

  let credentials: Record<string, string>;
  try {
    credentials = decryptCredentials(connection.encryptedCredentials);
  } catch (error) {
    await skipReminder(
      event,
      error instanceof Error ? error.message : 'Falha ao ler credenciais Evolution.',
    );
    return;
  }
  const evolution = readEvolutionConfiguration(credentials, connection.configuration);
  if (!evolution) {
    await skipReminder(
      event,
      'Evolution incompleto: informe API key, base URL e nome da instância.',
    );
    return;
  }

  const number = normalizeWhatsAppNumber(reminder.appointment.patient.primaryPhone);
  await sendEvolutionText(evolution, number, reminderMessage(reminder));
  await prisma.$transaction([
    prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: { status: 'SENT', statusReason: null },
    }),
    prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    }),
    prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    }),
  ]);
}

async function processEvent(event: OutboxEvent): Promise<void> {
  if (event.eventType === WHATSAPP_REMINDER_EVENT) {
    await processWhatsAppReminder(event);
    return;
  }
  if (event.eventType === APPOINTMENT_COMPLETED_EVENT) {
    await processAppointmentCompleted(event);
    return;
  }
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
  });
}

async function processAppointmentCompleted(event: OutboxEvent): Promise<void> {
  const payload = (event.payload ?? {}) as {
    organizationId?: string;
    clinicId?: string;
    patientId?: string;
    professionalId?: string;
    category?: string | null;
    appointmentId?: string;
  };
  const organizationId = payload.organizationId;
  const clinicId = payload.clinicId;
  const patientId = payload.patientId;
  if (!organizationId || !clinicId || !patientId) {
    throw new Error('Payload de appointment.completed incompleto.');
  }

  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId,
      active: true,
      trigger: 'APPOINTMENT_COMPLETED',
      OR: [{ clinicId }, { clinicId: null }],
    },
  });

  for (const rule of rules) {
    const conditions = (rule.conditions ?? {}) as { specialty?: string; category?: string };
    if (conditions.specialty && conditions.specialty !== payload.category) continue;
    if (conditions.category && conditions.category !== payload.category) continue;

    const action = (rule.action ?? {}) as {
      type?: string;
      reason?: string;
      preferredChannel?: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'IN_PERSON';
      daysAfter?: number;
    };
    if (action.type !== 'CREATE_RETURN_ALERT' || !action.reason) continue;

    const daysAfter = typeof action.daysAfter === 'number' ? action.daysAfter : 7;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + daysAfter);

    const existing = await prisma.returnAlert.findFirst({
      where: {
        organizationId,
        clinicId,
        patientId,
        status: { in: ['PENDING', 'CONTACTED'] },
        reason: action.reason,
        notes: { contains: event.aggregateId },
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.returnAlert.create({
      data: {
        organizationId,
        clinicId,
        patientId,
        professionalId: payload.professionalId,
        reason: action.reason,
        specialty: conditions.specialty ?? payload.category ?? undefined,
        dueAt,
        preferredChannel: action.preferredChannel ?? 'WHATSAPP',
        notes: `Automação ${rule.name} · appointment ${event.aggregateId}`,
        appointmentId: event.aggregateId,
      },
    });
  }

  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
  });
}

export async function processOutbox(): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  for (const event of events) {
    try {
      await processEvent(event);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro desconhecido';
      const eventUpdate = prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: reason.slice(0, 500),
        },
      });
      if (event.eventType === WHATSAPP_REMINDER_EVENT) {
        await prisma.$transaction([
          prisma.appointmentReminder.updateMany({
            where: { id: event.aggregateId },
            data: { status: 'FAILED', statusReason: reason.slice(0, 500) },
          }),
          eventUpdate,
        ]);
      } else {
        await eventUpdate;
      }
    }
  }
}

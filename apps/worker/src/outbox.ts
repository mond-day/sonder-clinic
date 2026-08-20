import { prisma } from '@sonder/database';
import { envelopeDecryptJson } from '@sonder/observability';
import { isWithinAllowedHours, nextAllowedWindowStart } from './allowed-hours';
import { readEvolutionConfiguration, sendEvolutionText } from './evolution';
import { isChatwootMock, readChatwootConfiguration, sendChatwootText } from './chatwoot';
import {
  decryptIntegrationCredentials,
  deleteCalendarEvent,
  encryptIntegrationCredentials,
  ensureAccessToken,
  isGoogleCalendarMock,
  readCalendarId,
  readTokens,
  resolveGoogleOAuth,
  upsertCalendarEvent,
} from './google-calendar';

const WHATSAPP_REMINDER_EVENT = 'appointment.whatsapp-reminder.requested';
const APPOINTMENT_COMPLETED_EVENT = 'appointment.completed';
const CALENDAR_SYNC_EVENT = 'appointment.calendar-sync.requested';
const MAX_ATTEMPTS = 5;

type OutboxEvent = {
  id: string;
  eventType: string;
  aggregateId: string;
  attempts: number;
  payload: unknown;
};

function decryptCredentials(payload: string): Record<string, string> {
  const credentials = envelopeDecryptJson(payload);
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

  const evolutionConnection = await prisma.integrationConnection.findFirst({
    where: {
      clinicId: reminder.appointment.clinicId,
      provider: 'EVOLUTION',
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
  });
  const chatwootConnection = await prisma.integrationConnection.findFirst({
    where: {
      clinicId: reminder.appointment.clinicId,
      provider: 'CHATWOOT',
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
  });

  const evolutionLive = Boolean(
    evolutionConnection?.encryptedCredentials && process.env.EVOLUTION_MOCK !== 'true',
  );
  const chatwootLive = Boolean(
    chatwootConnection?.encryptedCredentials && !isChatwootMock(),
  );

  if (!evolutionLive && !chatwootLive) {
    const reason = !evolutionConnection?.encryptedCredentials && !chatwootConnection?.encryptedCredentials
      ? 'WhatsApp não configurado (Evolution ou Chatwoot) ou conexão desativada.'
      : process.env.EVOLUTION_MOCK === 'true' && isChatwootMock()
        ? 'Evolution e Chatwoot estão em modo mock; nenhum WhatsApp foi enviado.'
        : 'WhatsApp live indisponível: desative o MOCK e configure credenciais Evolution ou Chatwoot.';
    await skipReminder(event, reason);
    return;
  }

  const number = normalizeWhatsAppNumber(reminder.appointment.patient.primaryPhone);
  const text = reminderMessage(reminder);

  if (evolutionLive && evolutionConnection?.encryptedCredentials) {
    let credentials: Record<string, string>;
    try {
      credentials = decryptCredentials(evolutionConnection.encryptedCredentials);
    } catch (error) {
      await skipReminder(
        event,
        error instanceof Error ? error.message : 'Falha ao ler credenciais Evolution.',
      );
      return;
    }
    const evolution = readEvolutionConfiguration(credentials, evolutionConnection.configuration);
    if (!evolution) {
      if (!chatwootLive) {
        await skipReminder(event, 'Evolution incompleto: informe API key, base URL e nome da instância.');
        return;
      }
    } else {
      await sendEvolutionText(evolution, number, text);
      await prisma.$transaction([
        prisma.appointmentReminder.update({
          where: { id: reminder.id },
          data: { status: 'SENT', statusReason: null },
        }),
        prisma.integrationConnection.update({
          where: { id: evolutionConnection.id },
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
      return;
    }
  }

  if (!chatwootConnection?.encryptedCredentials) {
    await skipReminder(event, 'Chatwoot não configurado ou conexão desativada.');
    return;
  }
  let chatwootCredentials: Record<string, string>;
  try {
    chatwootCredentials = decryptCredentials(chatwootConnection.encryptedCredentials);
  } catch (error) {
    await skipReminder(
      event,
      error instanceof Error ? error.message : 'Falha ao ler credenciais Chatwoot.',
    );
    return;
  }
  const chatwoot = readChatwootConfiguration(chatwootCredentials, chatwootConnection.configuration);
  if (!chatwoot) {
    await skipReminder(event, 'Chatwoot incompleto: informe base URL, token e account id.');
    return;
  }
  await sendChatwootText(
    chatwoot,
    number,
    text,
    reminder.appointment.patient.preferredName ?? reminder.appointment.patient.fullName,
  );
  await prisma.$transaction([
    prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: { status: 'SENT', statusReason: null },
    }),
    prisma.integrationConnection.update({
      where: { id: chatwootConnection.id },
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

async function processEvent(event: OutboxEvent): Promise<'done' | 'deferred'> {
  if (event.eventType === WHATSAPP_REMINDER_EVENT) {
    await processWhatsAppReminder(event);
    return 'done';
  }
  if (event.eventType === CALENDAR_SYNC_EVENT) {
    await processCalendarSync(event);
    return 'done';
  }
  if (event.eventType === APPOINTMENT_COMPLETED_EVENT) {
    return processAppointmentCompleted(event);
  }
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
  });
  return 'done';
}

async function processCalendarSync(event: OutboxEvent): Promise<void> {
  const payload = (event.payload ?? {}) as { appointmentId?: string; action?: 'UPSERT' | 'DELETE' };
  const appointmentId = payload.appointmentId ?? event.aggregateId;
  const action = payload.action === 'DELETE' ? 'DELETE' : 'UPSERT';

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { fullName: true, preferredName: true } },
      professional: { select: { name: true } },
      clinic: { select: { tradeName: true } },
      unit: { select: { timezone: true } },
    },
  });
  if (!appointment) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: 'Agendamento não encontrado; sync descartado.',
      },
    });
    return;
  }

  if (isGoogleCalendarMock()) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: 'Google Calendar MOCK=true; sync não executado.',
      },
    });
    return;
  }

  const connection = await prisma.integrationConnection.findFirst({
    where: {
      clinicId: appointment.clinicId,
      provider: 'GOOGLE_CALENDAR',
      status: 'ACTIVE',
      encryptedCredentials: { not: null },
    },
  });
  if (!connection?.encryptedCredentials) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: 'Google Calendar não configurado para a clínica.',
      },
    });
    return;
  }

  let credentials = decryptIntegrationCredentials(connection.encryptedCredentials);
  const oauth = resolveGoogleOAuth(credentials);
  if (!oauth || !readTokens(credentials)) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: 'Google Calendar sem OAuth completo (refresh_token).',
      },
    });
    return;
  }

  const fresh = await ensureAccessToken(oauth, credentials);
  if (fresh.refreshed) {
    credentials = fresh.credentials;
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { encryptedCredentials: encryptIntegrationCredentials(credentials) },
    });
  }

  const calendarId = readCalendarId(connection.configuration);
  const patientName = appointment.patient.preferredName ?? appointment.patient.fullName;

  if (action === 'DELETE' || ['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
    if (appointment.externalCalendarEventId) {
      await deleteCalendarEvent(fresh.accessToken, calendarId, appointment.externalCalendarEventId);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { externalCalendarEventId: null },
      });
    }
  } else {
    const eventId = await upsertCalendarEvent({
      accessToken: fresh.accessToken,
      calendarId,
      eventId: appointment.externalCalendarEventId,
      summary: `${patientName} · ${appointment.professional.name}`,
      description: [
        `Clínica: ${appointment.clinic.tradeName}`,
        appointment.category ? `Categoria: ${appointment.category}` : null,
        appointment.notes ? `Obs: ${appointment.notes}` : null,
        `Sonder appointmentId=${appointment.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      timeZone: appointment.unit.timezone || 'America/Cuiaba',
      appointmentId: appointment.id,
    });
    if (eventId !== appointment.externalCalendarEventId) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { externalCalendarEventId: eventId },
      });
    }
  }

  await prisma.$transaction([
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

async function processAppointmentCompleted(event: OutboxEvent): Promise<'done' | 'deferred'> {
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

  const matching = rules.filter((rule) => {
    const conditions = (rule.conditions ?? {}) as { specialty?: string; category?: string };
    if (conditions.specialty && conditions.specialty !== payload.category) return false;
    if (conditions.category && conditions.category !== payload.category) return false;
    const action = (rule.action ?? {}) as { type?: string; reason?: string };
    return action.type === 'CREATE_RETURN_ALERT' && Boolean(action.reason);
  });

  const dueNow = matching.filter((rule) => isWithinAllowedHours(rule.allowedHours));
  const deferred = matching.filter((rule) => !isWithinAllowedHours(rule.allowedHours));

  // Se todas as regras aplicáveis estão fora da janela, adia o evento (sem consumir attempts).
  if (dueNow.length === 0 && deferred.length > 0) {
    const leaseUntil = deferred
      .map((rule) => nextAllowedWindowStart(rule.allowedHours))
      .sort((a, b) => a.getTime() - b.getTime())[0]!;
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        lockedBy: null,
        leaseUntil,
        processingAt: null,
        lastError: `Aguardando allowedHours até ${leaseUntil.toISOString()}`,
      },
    });
    return 'deferred';
  }

  for (const rule of dueNow) {
    const conditions = (rule.conditions ?? {}) as { specialty?: string; category?: string };
    const action = (rule.action ?? {}) as {
      type?: string;
      reason?: string;
      preferredChannel?: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'IN_PERSON';
      daysAfter?: number;
    };
    if (!action.reason) continue;

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

  // Regras fora da janela misturadas com dueNow são ignoradas neste evento (ver A38).
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
  });
  return 'done';
}

export async function processOutbox(): Promise<void> {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const leaseMs = 60_000;
  const now = new Date();

  // Claim atômico com SKIP LOCKED para múltiplas réplicas.
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "OutboxEvent" AS o
    SET
      "lockedBy" = ${workerId},
      "leaseUntil" = ${new Date(now.getTime() + leaseMs)},
      "processingAt" = ${now}
    WHERE o.id IN (
      SELECT id FROM "OutboxEvent"
      WHERE "processedAt" IS NULL
        AND "deadLetterAt" IS NULL
        AND "attempts" < ${MAX_ATTEMPTS}
        AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    )
    RETURNING o.id
  `;

  if (!claimed.length) return;

  const events = await prisma.outboxEvent.findMany({
    where: { id: { in: claimed.map((row) => row.id) }, lockedBy: workerId },
    orderBy: { createdAt: 'asc' },
  });

  for (const event of events) {
    try {
      const outcome = await processEvent(event);
      if (outcome === 'deferred') {
        // leaseUntil já definido em processAppointmentCompleted — não zerar.
        continue;
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          lockedBy: null,
          leaseUntil: null,
          processingAt: null,
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro desconhecido';
      const nextAttempts = event.attempts + 1;
      const deadLetter = nextAttempts >= MAX_ATTEMPTS;
      const eventUpdate = prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: reason.slice(0, 500),
          lockedBy: null,
          leaseUntil: null,
          processingAt: null,
          ...(deadLetter ? { deadLetterAt: new Date() } : {}),
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, sendChatwootText } = vi.hoisted(() => {
  const db = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
    outboxEvent: { findMany: vi.fn(), update: vi.fn() },
    appointmentReminder: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    messageTemplate: { findFirst: vi.fn() },
    communicationPreference: { findUnique: vi.fn() },
    integrationConnection: { findFirst: vi.fn(), update: vi.fn() },
  };
  return { db, sendChatwootText: vi.fn() };
});

vi.mock('@sonder/database', () => ({
  prisma: db,
  reminderCategoryFromChannel: (channel: string) =>
    channel === 'WHATSAPP:CONFIRMATION' ? 'CONFIRMATION' : 'REMINDER',
}));
vi.mock('@sonder/observability', () => ({ envelopeDecryptJson: () => ({ apiToken: 'tok' }) }));
vi.mock('./chatwoot', () => ({
  isChatwootMock: () => false,
  readChatwootConfiguration: () => ({ baseUrl: 'https://cw.example', token: 'tok', accountId: '1', inboxId: '7' }),
  sendChatwootText,
}));
vi.mock('./evolution', () => ({ readEvolutionConfiguration: vi.fn(), sendEvolutionText: vi.fn() }));
vi.mock('./reminder-message', () => ({ reminderMessageText: () => 'Estamos organizando a agenda de amanhã' }));
vi.mock('./google-calendar', () => ({}));
vi.mock('./nibo-sync', () => ({}));
vi.mock('./nibo-pull', () => ({ NIBO_PULL_EVENT: 'finance.nibo-pull.requested', processNiboPullConnection: vi.fn() }));

import { processOutbox } from './outbox';

const REMINDER_EVENT = 'appointment.whatsapp-reminder.requested';

function reminder(status: string) {
  return {
    id: 'conf-1',
    organizationId: 'org-1',
    channel: 'WHATSAPP:CONFIRMATION',
    status,
    statusReason: null,
    scheduledFor: new Date(Date.now() - 60_000),
    appointment: {
      status: 'SCHEDULED',
      clinicId: 'clinic-1',
      patient: { id: 'pat-1', primaryPhone: '65999990000', fullName: 'Paciente', preferredName: null },
    },
  };
}

describe('lembrete WhatsApp idempotente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([{ id: 'evt-1' }, { id: 'evt-2' }]);
    // Dois eventos do mesmo lembrete (ex.: reativação repetida) lidos antes de qualquer envio.
    db.outboxEvent.findMany.mockResolvedValue([
      { id: 'evt-1', eventType: REMINDER_EVENT, aggregateId: 'conf-1', attempts: 0, payload: {} },
      { id: 'evt-2', eventType: REMINDER_EVENT, aggregateId: 'conf-1', attempts: 0, payload: {} },
    ]);
    db.appointmentReminder.findUnique.mockResolvedValue(reminder('PENDING'));
    db.messageTemplate.findFirst.mockResolvedValue({ content: 'x', requiresConsent: false });
    db.integrationConnection.findFirst.mockImplementation(({ where }: { where: { provider: string } }) =>
      Promise.resolve(where.provider === 'CHATWOOT' ? { id: 'conn-cw', encryptedCredentials: 'enc', configuration: {} } : null));
    db.outboxEvent.update.mockResolvedValue({});
    db.appointmentReminder.update.mockResolvedValue({});
    db.integrationConnection.update.mockResolvedValue({});
  });

  it('só o evento que ganha o claim envia; o duplicado é descartado', async () => {
    db.appointmentReminder.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await processOutbox();

    expect(sendChatwootText).toHaveBeenCalledTimes(1);
    expect(db.appointmentReminder.updateMany).toHaveBeenCalledWith({
      where: { id: 'conf-1', status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SENDING', statusReason: null },
    });
    expect(db.outboxEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'evt-2' },
      data: expect.objectContaining({ processedAt: expect.any(Date), lastError: expect.stringMatching(/duplicado/) }),
    }));
  });

  it('lembrete já enviado não é reenviado', async () => {
    db.appointmentReminder.findUnique.mockResolvedValue(reminder('SENT'));

    await processOutbox();

    expect(sendChatwootText).not.toHaveBeenCalled();
    expect(db.appointmentReminder.updateMany).not.toHaveBeenCalled();
  });

  it('falha no envio volta para FAILED e o próximo evento pode tentar de novo', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 'evt-1' }]);
    db.outboxEvent.findMany.mockResolvedValue([
      { id: 'evt-1', eventType: REMINDER_EVENT, aggregateId: 'conf-1', attempts: 0, payload: {} },
    ]);
    db.appointmentReminder.updateMany.mockResolvedValue({ count: 1 });
    sendChatwootText.mockRejectedValueOnce(new Error('Chatwoot fora do ar'));

    await processOutbox();

    expect(db.appointmentReminder.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'conf-1' },
      data: { status: 'FAILED', statusReason: 'Chatwoot fora do ar' },
    });
  });
});

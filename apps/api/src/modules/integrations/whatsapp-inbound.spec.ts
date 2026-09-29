import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@sonder/database';
import {
  handleWhatsAppReply,
  readChatwootInbound,
  readEvolutionInbound,
  verifyWhatsappWebhookToken,
  whatsappWebhookToken,
} from './whatsapp-inbound';

const KEY = 'a'.repeat(64);
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

describe('token do webhook WhatsApp', () => {
  it('aceita o token da própria conexão e recusa outro', () => {
    const token = whatsappWebhookToken(CONNECTION_ID, KEY)!;
    expect(verifyWhatsappWebhookToken(CONNECTION_ID, token, KEY)).toBe(true);
    expect(verifyWhatsappWebhookToken('22222222-2222-4222-8222-222222222222', token, KEY)).toBe(false);
    expect(verifyWhatsappWebhookToken(CONNECTION_ID, undefined, KEY)).toBe(false);
    expect(verifyWhatsappWebhookToken(CONNECTION_ID, token, 'curta')).toBe(false);
  });
});

describe('readEvolutionInbound', () => {
  const base = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5565999990000@s.whatsapp.net', fromMe: false, id: 'ABC' },
      message: { conversation: 'Sim' },
    },
  };

  it('lê telefone, texto e id', () => {
    expect(readEvolutionInbound(base)).toEqual({ messageId: 'ABC', phone: '5565999990000', text: 'Sim' });
  });

  it('aceita evento em maiúsculas e texto estendido', () => {
    expect(
      readEvolutionInbound({
        event: 'MESSAGES_UPSERT',
        data: { ...base.data, message: { extendedTextMessage: { text: 'cancelar' } } },
      })?.text,
    ).toBe('cancelar');
  });

  it('ignora mensagens da própria clínica, grupos e outros eventos', () => {
    expect(readEvolutionInbound({ ...base, data: { ...base.data, key: { ...base.data.key, fromMe: true } } })).toBeNull();
    expect(
      readEvolutionInbound({ ...base, data: { ...base.data, key: { ...base.data.key, remoteJid: '123@g.us' } } }),
    ).toBeNull();
    expect(readEvolutionInbound({ ...base, event: 'connection.update' })).toBeNull();
  });
});

describe('readChatwootInbound', () => {
  const base = {
    event: 'message_created',
    message_type: 'incoming',
    id: 42,
    content: '1',
    sender: { phone_number: '+55 65 99999-0000' },
  };

  it('lê mensagem recebida', () => {
    expect(readChatwootInbound(base)).toEqual({ messageId: '42', phone: '+55 65 99999-0000', text: '1' });
  });

  it('ignora mensagem enviada e nota privada', () => {
    expect(readChatwootInbound({ ...base, message_type: 'outgoing' })).toBeNull();
    expect(readChatwootInbound({ ...base, private: true })).toBeNull();
  });
});

describe('handleWhatsAppReply (Chatwoot)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function setup(reminders: unknown[]) {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', KEY);
    vi.spyOn(prisma.integrationConnection, 'findFirst').mockResolvedValue(
      { id: CONNECTION_ID, provider: 'CHATWOOT', clinicId: 'clinic-1' } as never,
    );
    vi.spyOn(prisma.webhookReceipt, 'create').mockResolvedValue({} as never);
    vi.spyOn(prisma.webhookReceipt, 'update').mockResolvedValue({} as never);
    const findReminders = vi.spyOn(prisma.appointmentReminder, 'findMany').mockResolvedValue(reminders as never);
    const tx = {
      appointment: { update: vi.fn() },
      appointmentStatusEvent: { create: vi.fn() },
      appointmentReminder: { updateMany: vi.fn() },
      outboxEvent: { create: vi.fn() },
      auditEvent: { create: vi.fn() },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(
      ((run: (client: typeof tx) => unknown) => Promise.resolve(run(tx))) as never,
    );
    return { tx, findReminders };
  }

  const payload = {
    event: 'message_created',
    message_type: 'incoming',
    id: 99,
    content: '✅Sim',
    sender: { phone_number: '+5565999990000' },
  };

  it('"✅Sim" confirma a consulta do paciente que recebeu o lembrete (telefone sem o 9º dígito no cadastro)', async () => {
    const { tx, findReminders } = setup([
      { appointment: { id: 'appt-1', status: 'SCHEDULED', patient: { primaryPhone: '(65) 9999-0000' } } },
    ]);

    const result = await handleWhatsAppReply({
      connectionId: CONNECTION_ID,
      token: whatsappWebhookToken(CONNECTION_ID, KEY)!,
      payload,
    });

    expect(result).toEqual({ handled: true, appointmentId: 'appt-1', intent: 'CONFIRM', status: 'CONFIRMED' });
    expect(findReminders).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['SENT', 'SENDING'] },
        appointment: expect.objectContaining({ clinicId: 'clinic-1' }),
      }),
    }));
    expect(tx.appointment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'appt-1' },
      data: expect.objectContaining({ status: 'CONFIRMED' }),
    }));
  });

  it('sem lembrete enviado para aquele telefone não mexe em nada', async () => {
    const { tx } = setup([]);

    const result = await handleWhatsAppReply({
      connectionId: CONNECTION_ID,
      token: whatsappWebhookToken(CONNECTION_ID, KEY)!,
      payload,
    });

    expect(result).toEqual({ handled: false, reason: 'no-appointment' });
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });

  it('recusa token errado', async () => {
    setup([]);
    await expect(handleWhatsAppReply({ connectionId: CONNECTION_ID, token: 'x', payload }))
      .rejects.toThrow(/Token/);
  });
});

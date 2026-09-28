import { describe, expect, it } from 'vitest';
import {
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

import { asRecord, envFlag, fetchJson, httpErrorDetail, pickString, type AdapterResult } from './http';

export type ChatwootConfig = {
  baseUrl: string;
  token: string;
  accountId: string;
  inboxId?: string;
};

export function isChatwootMock() {
  return envFlag('CHATWOOT_MOCK', 'true');
}

export function resolveChatwootConfig(
  credentials?: Record<string, string>,
  configuration?: unknown,
): ChatwootConfig | null {
  const creds = credentials ?? {};
  const settings = asRecord(configuration) ?? {};
  const baseUrl = pickString(
    process.env.CHATWOOT_BASE_URL,
    creds.baseUrl,
    creds.CHATWOOT_BASE_URL,
    creds.BASE_URL,
    settings.baseUrl,
    settings.CHATWOOT_BASE_URL,
    settings.BASE_URL,
  ).replace(/\/+$/, '');
  const token = pickString(
    process.env.CHATWOOT_API_ACCESS_TOKEN,
    creds.apiToken,
    creds.api_access_token,
    creds.CHATWOOT_API_ACCESS_TOKEN,
    creds.token,
    settings.apiToken,
  );
  const accountId = pickString(
    process.env.CHATWOOT_ACCOUNT_ID,
    creds.accountId,
    creds.CHATWOOT_ACCOUNT_ID,
    settings.accountId,
    settings.CHATWOOT_ACCOUNT_ID,
  );
  const inboxId = pickString(
    process.env.CHATWOOT_INBOX_ID,
    creds.inboxId,
    creds.CHATWOOT_INBOX_ID,
    settings.inboxId,
    settings.CHATWOOT_INBOX_ID,
  );
  if (!baseUrl || !token || !accountId) return null;
  return { baseUrl, token, accountId, inboxId: inboxId || undefined };
}

export function toChatwootPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) {
    throw new Error('Telefone inválido para Chatwoot.');
  }
  return `+${withCountry}`;
}

function headers(config: ChatwootConfig): Record<string, string> {
  return {
    api_access_token: config.token,
    'content-type': 'application/json',
    Accept: 'application/json',
  };
}

function accountUrl(config: ChatwootConfig, path = '') {
  return `${config.baseUrl}/api/v1/accounts/${encodeURIComponent(config.accountId)}${path}`;
}

function unwrapPayload(body: unknown): unknown {
  const row = asRecord(body);
  if (!row) return body;
  if ('payload' in row) return row.payload;
  return body;
}

function contactFromBody(body: unknown): Record<string, unknown> | null {
  const payload = unwrapPayload(body);
  const direct = asRecord(payload);
  if (direct?.id != null) return direct;
  if (direct?.contact) return asRecord(direct.contact);
  if (Array.isArray(payload)) {
    const first = payload.find((item) => asRecord(item)?.id != null);
    return asRecord(first);
  }
  return asRecord(body);
}

function sourceIdFromContact(contact: Record<string, unknown>, inboxId?: string): string {
  const inboxes = Array.isArray(contact.contact_inboxes) ? contact.contact_inboxes : [];
  const matches = inboxes
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const preferred = inboxId
    ? matches.find((item) => {
        const inbox = asRecord(item.inbox);
        return pickString(item.inbox_id, inbox?.id) === inboxId;
      })
    : matches[0];
  return pickString(preferred?.source_id, asRecord(preferred)?.sourceId);
}

async function chatwootJson(config: ChatwootConfig, path: string, init?: RequestInit) {
  return fetchJson(accountUrl(config, path), {
    ...init,
    headers: { ...headers(config), ...(init?.headers as Record<string, string> | undefined) },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });
}

export async function testChatwoot(config?: ChatwootConfig | null): Promise<AdapterResult> {
  const resolved = config ?? resolveChatwootConfig();
  if (isChatwootMock() || !resolved) {
    return {
      success: false,
      provider: 'CHATWOOT',
      enabled: false,
      message: isChatwootMock()
        ? 'Chatwoot desabilitado (CHATWOOT_MOCK=true).'
        : 'Chatwoot desabilitado: configure BASE_URL, TOKEN e ACCOUNT_ID.',
    };
  }
  try {
    const result = await chatwootJson(resolved, '');
    return {
      success: result.ok,
      provider: 'CHATWOOT',
      enabled: true,
      message: result.ok ? 'Conexão Chatwoot confirmada.' : `Falha Chatwoot HTTP ${result.status}.`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      provider: 'CHATWOOT',
      enabled: true,
      message: `Erro ao contatar Chatwoot: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

async function searchContact(config: ChatwootConfig, phone: string) {
  const result = await chatwootJson(config, `/contacts/search?q=${encodeURIComponent(phone)}`);
  if (!result.ok) return null;
  const payload = unwrapPayload(result.body);
  const rows = Array.isArray(payload) ? payload : [];
  const match = rows.find((item) => {
    const contact = asRecord(item);
    const candidate = pickString(contact?.phone_number, contact?.phoneNumber);
    return candidate.replace(/\D/g, '') === phone.replace(/\D/g, '');
  });
  return asRecord(match);
}

async function createContact(config: ChatwootConfig, input: { phone: string; name?: string; inboxId: string }) {
  const result = await chatwootJson(config, '/contacts', {
    method: 'POST',
    body: JSON.stringify({
      inbox_id: Number(input.inboxId),
      name: input.name || input.phone,
      phone_number: input.phone,
      identifier: input.phone,
    }),
  });
  if (!result.ok) {
    const existing = await searchContact(config, input.phone);
    if (existing) return existing;
    throw new Error(`Chatwoot não criou o contato: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`);
  }
  return contactFromBody(result.body) ?? await searchContact(config, input.phone);
}

async function ensureContactInbox(
  config: ChatwootConfig,
  contact: Record<string, unknown>,
  inboxId: string,
): Promise<string> {
  const existing = sourceIdFromContact(contact, inboxId);
  if (existing) return existing;
  const contactId = pickString(contact.id);
  if (!contactId) throw new Error('Chatwoot retornou contato sem id.');
  const result = await chatwootJson(config, `/contacts/${encodeURIComponent(contactId)}/contact_inboxes`, {
    method: 'POST',
    body: JSON.stringify({ inbox_id: Number(inboxId) }),
  });
  if (!result.ok) {
    throw new Error(`Chatwoot não vinculou o inbox: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`);
  }
  const payload = asRecord(unwrapPayload(result.body)) ?? asRecord(result.body);
  const sourceId = pickString(payload?.source_id, asRecord(payload)?.sourceId);
  if (!sourceId) throw new Error('Chatwoot não devolveu source_id do inbox.');
  return sourceId;
}

async function findOpenConversation(config: ChatwootConfig, contactId: string, inboxId: string) {
  const result = await chatwootJson(config, `/contacts/${encodeURIComponent(contactId)}/conversations`);
  if (!result.ok) return null;
  const payload = unwrapPayload(result.body);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload)?.payload)
      ? (asRecord(payload)?.payload as unknown[])
      : [];
  const open = rows
    .map((item) => asRecord(item))
    .find((item) => {
      if (!item) return false;
      const status = pickString(item.status).toLowerCase();
      const itemInbox = pickString(item.inbox_id, asRecord(item.meta)?.inbox_id, asRecord(item.inbox)?.id);
      return itemInbox === inboxId && (status === 'open' || status === 'pending' || !status);
    });
  const id = pickString(open?.id);
  return id || null;
}

async function createConversation(
  config: ChatwootConfig,
  input: { sourceId: string; inboxId: string; contactId: string; text: string },
) {
  const result = await chatwootJson(config, '/conversations', {
    method: 'POST',
    body: JSON.stringify({
      source_id: input.sourceId,
      inbox_id: Number(input.inboxId),
      contact_id: Number(input.contactId),
      status: 'open',
      message: { content: input.text },
    }),
  });
  if (!result.ok) {
    throw new Error(`Chatwoot não criou a conversa: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`);
  }
  const payload = asRecord(unwrapPayload(result.body)) ?? asRecord(result.body);
  return pickString(payload?.id);
}

async function postMessage(config: ChatwootConfig, conversationId: string, text: string) {
  const result = await chatwootJson(
    config,
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: text,
        message_type: 'outgoing',
        private: false,
      }),
    },
  );
  if (!result.ok) {
    throw new Error(`Chatwoot não enviou a mensagem: ${httpErrorDetail(result.body, `HTTP ${result.status}`)}`);
  }
  const payload = asRecord(unwrapPayload(result.body)) ?? asRecord(result.body);
  return pickString(payload?.id);
}

/**
 * Lookup-or-create de contato/conversa e envio de mensagem outgoing.
 * Não implementa CRM; só o caminho outbound oficial da Application API.
 */
export async function sendChatwootText(
  config: ChatwootConfig,
  input: { phone: string; name?: string; text: string },
): Promise<{ conversationId: string; messageId?: string }> {
  if (!config.inboxId) {
    throw new Error('Chatwoot inboxId é obrigatório para envio (inbox WhatsApp/API).');
  }
  const phone = toChatwootPhone(input.phone);
  let contact = await searchContact(config, phone);
  if (!contact) {
    contact = await createContact(config, { phone, name: input.name, inboxId: config.inboxId });
  }
  if (!contact) throw new Error('Chatwoot não encontrou nem criou o contato.');
  const sourceId = await ensureContactInbox(config, contact, config.inboxId);
  const contactId = pickString(contact.id);
  const existingConversation = contactId
    ? await findOpenConversation(config, contactId, config.inboxId)
    : null;
  if (existingConversation) {
    const messageId = await postMessage(config, existingConversation, input.text);
    return { conversationId: existingConversation, messageId };
  }
  const conversationId = await createConversation(config, {
    sourceId,
    inboxId: config.inboxId,
    contactId,
    text: input.text,
  });
  if (!conversationId) throw new Error('Chatwoot não devolveu o id da conversa.');
  return { conversationId };
}

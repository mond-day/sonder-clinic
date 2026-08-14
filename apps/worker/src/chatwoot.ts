export type ChatwootConfiguration = {
  baseUrl: string;
  token: string;
  accountId: string;
  inboxId?: string;
};

const firstString = (source: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isChatwootMock() {
  return (process.env.CHATWOOT_MOCK ?? 'true').toLowerCase() === 'true';
}

export function readChatwootConfiguration(
  credentials: Record<string, string>,
  configuration: unknown,
): ChatwootConfiguration | null {
  const settings = asRecord(configuration) ?? {};
  const env: Record<string, unknown> = {
    CHATWOOT_BASE_URL: process.env.CHATWOOT_BASE_URL,
    CHATWOOT_API_ACCESS_TOKEN: process.env.CHATWOOT_API_ACCESS_TOKEN,
    CHATWOOT_ACCOUNT_ID: process.env.CHATWOOT_ACCOUNT_ID,
    CHATWOOT_INBOX_ID: process.env.CHATWOOT_INBOX_ID,
  };
  const baseUrl = (
    firstString(credentials, ['baseUrl', 'CHATWOOT_BASE_URL', 'BASE_URL'])
    ?? firstString(settings, ['baseUrl', 'CHATWOOT_BASE_URL'])
    ?? firstString(env, ['CHATWOOT_BASE_URL'])
  )?.replace(/\/+$/, '');
  const token =
    firstString(credentials, ['apiToken', 'api_access_token', 'CHATWOOT_API_ACCESS_TOKEN', 'token'])
    ?? firstString(settings, ['apiToken'])
    ?? firstString(env, ['CHATWOOT_API_ACCESS_TOKEN']);
  const accountId =
    firstString(credentials, ['accountId', 'CHATWOOT_ACCOUNT_ID'])
    ?? firstString(settings, ['accountId', 'CHATWOOT_ACCOUNT_ID'])
    ?? firstString(env, ['CHATWOOT_ACCOUNT_ID']);
  const inboxId =
    firstString(credentials, ['inboxId', 'CHATWOOT_INBOX_ID'])
    ?? firstString(settings, ['inboxId', 'CHATWOOT_INBOX_ID'])
    ?? firstString(env, ['CHATWOOT_INBOX_ID']);
  if (!baseUrl || !token || !accountId) return null;
  return { baseUrl, token, accountId, inboxId };
}

function toPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (withCountry.length < 10 || withCountry.length > 15) {
    throw new Error('Paciente sem telefone válido para WhatsApp.');
  }
  return `+${withCountry}`;
}

function unwrap(body: unknown): unknown {
  const row = asRecord(body);
  return row && 'payload' in row ? row.payload : body;
}

async function json(config: ChatwootConfiguration, path: string, init?: RequestInit) {
  const response = await fetch(
    `${config.baseUrl}/api/v1/accounts/${encodeURIComponent(config.accountId)}${path}`,
    {
      ...init,
      headers: {
        api_access_token: config.token,
        'content-type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: response.ok, status: response.status, body };
}

export async function sendChatwootText(
  config: ChatwootConfiguration,
  number: string,
  text: string,
  name?: string,
): Promise<void> {
  if (!config.inboxId) {
    throw new Error('Chatwoot incompleto: informe o ID da caixa de entrada (inbox).');
  }
  const phone = toPhone(number);
  const search = await json(config, `/contacts/search?q=${encodeURIComponent(phone)}`);
  const found = Array.isArray(unwrap(search.body)) ? (unwrap(search.body) as unknown[]) : [];
  let contact = asRecord(found.find((item) => {
    const row = asRecord(item);
    return (row?.phone_number as string | undefined)?.replace(/\D/g, '') === phone.replace(/\D/g, '');
  }));

  if (!contact) {
    const created = await json(config, '/contacts', {
      method: 'POST',
      body: JSON.stringify({
        inbox_id: Number(config.inboxId),
        name: name || phone,
        phone_number: phone,
        identifier: phone,
      }),
    });
    const payload = unwrap(created.body);
    contact = asRecord(payload) ?? asRecord(asRecord(payload)?.contact);
    if (!created.ok && !contact) {
      throw new Error(`Chatwoot não criou o contato (HTTP ${created.status}).`);
    }
  }
  if (!contact?.id) throw new Error('Chatwoot não devolveu o contato.');

  const inboxes = Array.isArray(contact.contact_inboxes) ? contact.contact_inboxes : [];
  let sourceId = '';
  for (const item of inboxes) {
    const row = asRecord(item);
    const inbox = asRecord(row?.inbox);
    if (String(row?.inbox_id ?? inbox?.id ?? '') === config.inboxId) {
      sourceId = String(row?.source_id ?? '');
      break;
    }
  }
  if (!sourceId) {
    const attached = await json(config, `/contacts/${encodeURIComponent(String(contact.id))}/contact_inboxes`, {
      method: 'POST',
      body: JSON.stringify({ inbox_id: Number(config.inboxId) }),
    });
    const payload = asRecord(unwrap(attached.body)) ?? asRecord(attached.body);
    sourceId = String(payload?.source_id ?? '');
  }
  if (!sourceId) throw new Error('Chatwoot não devolveu source_id.');

  const conversations = await json(config, `/contacts/${encodeURIComponent(String(contact.id))}/conversations`);
  const list = Array.isArray(unwrap(conversations.body)) ? (unwrap(conversations.body) as unknown[]) : [];
  const open = list.map((item) => asRecord(item)).find((item) => {
    if (!item) return false;
    return String(item.inbox_id ?? '') === config.inboxId && String(item.status ?? 'open') !== 'resolved';
  });
  if (open?.id) {
    const sent = await json(config, `/conversations/${encodeURIComponent(String(open.id))}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: text, message_type: 'outgoing', private: false }),
    });
    if (!sent.ok) throw new Error(`Chatwoot não enviou a mensagem (HTTP ${sent.status}).`);
    return;
  }

  const createdConversation = await json(config, '/conversations', {
    method: 'POST',
    body: JSON.stringify({
      source_id: sourceId,
      inbox_id: Number(config.inboxId),
      contact_id: Number(contact.id),
      status: 'open',
      message: { content: text },
    }),
  });
  if (!createdConversation.ok) {
    throw new Error(`Chatwoot não criou a conversa (HTTP ${createdConversation.status}).`);
  }
}

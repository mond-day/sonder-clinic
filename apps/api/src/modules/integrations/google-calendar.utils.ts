/**
 * Google Calendar OAuth + Calendar API helpers (A38 / Fatia 4).
 * Credenciais via env ou conexão persistida — nunca hardcode.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  scope?: string;
  tokenType?: string;
};

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timeZone?: string;
  appointmentId: string;
};

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function resolveGoogleOAuthCredentials(
  connectionCredentials?: Record<string, string>,
): GoogleOAuthCredentials | null {
  const clientId = pickString(
    connectionCredentials?.clientId,
    process.env.GOOGLE_CLIENT_ID,
  );
  const clientSecret = pickString(
    connectionCredentials?.clientSecret,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  const redirectUri = pickString(
    process.env.GOOGLE_REDIRECT_URI,
    connectionCredentials?.redirectUri,
  );
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleCalendarMock(): boolean {
  return (process.env.GOOGLE_CALENDAR_MOCK ?? 'true').toLowerCase() === 'true';
}

export function buildGoogleAuthorizeUrl(
  credentials: GoogleOAuthCredentials,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

/** state = base64url(payload).hmac — payload JSON { connectionId, nonce, exp } */
export function signOAuthState(
  connectionId: string,
  secretHex: string,
  ttlMs = 15 * 60_000,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      connectionId,
      nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      exp: Date.now() + ttlMs,
    }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOAuthState(
  state: string,
  secretHex: string,
): { connectionId: string } | null {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(payload)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      connectionId?: string;
      exp?: number;
    };
    if (!parsed.connectionId || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { connectionId: parsed.connectionId };
  } catch {
    return null;
  }
}

async function parseJsonResponse(response: Response): Promise<{ ok: boolean; status: number; body: unknown }> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { ok: response.ok, status: response.status, body };
}

export async function exchangeGoogleAuthCode(
  credentials: GoogleOAuthCredentials,
  code: string,
): Promise<GoogleTokenBundle> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await parseJsonResponse(response);
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    throw new Error(`Troca de código Google falhou (HTTP ${result.status}).`);
  }
  const data = result.body as Record<string, unknown>;
  const accessToken = pickString(data.access_token);
  const refreshToken = pickString(data.refresh_token);
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  if (!accessToken) throw new Error('Google não retornou access_token.');
  if (!refreshToken) {
    throw new Error(
      'Google não retornou refresh_token. Revogue o acesso do app e autorize novamente com prompt=consent.',
    );
  }
  return {
    accessToken,
    refreshToken,
    expiryDate: Date.now() + expiresIn * 1000,
    scope: pickString(data.scope) || undefined,
    tokenType: pickString(data.token_type) || undefined,
  };
}

export async function refreshGoogleAccessToken(
  credentials: GoogleOAuthCredentials,
  refreshToken: string,
): Promise<Omit<GoogleTokenBundle, 'refreshToken'> & { refreshToken?: string }> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await parseJsonResponse(response);
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    throw new Error(`Refresh token Google falhou (HTTP ${result.status}).`);
  }
  const data = result.body as Record<string, unknown>;
  const accessToken = pickString(data.access_token);
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  if (!accessToken) throw new Error('Google não retornou access_token no refresh.');
  return {
    accessToken,
    refreshToken: pickString(data.refresh_token) || undefined,
    expiryDate: Date.now() + expiresIn * 1000,
    scope: pickString(data.scope) || undefined,
    tokenType: pickString(data.token_type) || undefined,
  };
}

export function tokensFromCredentials(credentials: Record<string, string>): GoogleTokenBundle | null {
  const accessToken = pickString(credentials.accessToken, credentials.access_token);
  const refreshToken = pickString(credentials.refreshToken, credentials.refresh_token);
  const expiryRaw = pickString(credentials.expiryDate, credentials.expiry_date);
  const expiryDate = expiryRaw ? Number(expiryRaw) : 0;
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiryDate: Number.isFinite(expiryDate) ? expiryDate : 0 };
}

export function mergeTokenCredentials(
  base: Record<string, string>,
  tokens: GoogleTokenBundle,
): Record<string, string> {
  return {
    ...base,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiryDate: String(tokens.expiryDate),
    ...(tokens.scope ? { scope: tokens.scope } : {}),
    ...(tokens.tokenType ? { tokenType: tokens.tokenType } : {}),
  };
}

export async function ensureFreshAccessToken(
  oauth: GoogleOAuthCredentials,
  credentials: Record<string, string>,
): Promise<{ accessToken: string; credentials: Record<string, string>; refreshed: boolean }> {
  const tokens = tokensFromCredentials(credentials);
  if (!tokens) {
    throw new Error('Conexão Google sem refresh_token. Execute OAuth novamente.');
  }
  const skewMs = 60_000;
  if (tokens.expiryDate > Date.now() + skewMs) {
    return { accessToken: tokens.accessToken, credentials, refreshed: false };
  }
  const refreshed = await refreshGoogleAccessToken(oauth, tokens.refreshToken);
  const next = mergeTokenCredentials(credentials, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiryDate: refreshed.expiryDate,
    scope: refreshed.scope,
    tokenType: refreshed.tokenType,
  });
  return { accessToken: refreshed.accessToken, credentials: next, refreshed: true };
}

function eventBody(input: GoogleCalendarEventInput) {
  const timeZone = input.timeZone || 'America/Cuiaba';
  return {
    summary: input.summary,
    description: input.description ?? '',
    start: { dateTime: input.startAt.toISOString(), timeZone },
    end: { dateTime: input.endAt.toISOString(), timeZone },
    extendedProperties: {
      private: { appointmentId: input.appointmentId, source: 'sonder-clinic' },
    },
  };
}

export async function upsertGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleCalendarEventInput,
  existingEventId?: string | null,
): Promise<{ eventId: string }> {
  const cal = encodeURIComponent(calendarId || 'primary');
  const body = JSON.stringify(eventBody(input));
  const url = existingEventId
    ? `${GOOGLE_CALENDAR}/calendars/${cal}/events/${encodeURIComponent(existingEventId)}`
    : `${GOOGLE_CALENDAR}/calendars/${cal}/events`;
  const response = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await parseJsonResponse(response);
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    throw new Error(`Google Calendar ${existingEventId ? 'PATCH' : 'POST'} falhou (HTTP ${result.status}).`);
  }
  const id = pickString((result.body as Record<string, unknown>).id);
  if (!id) throw new Error('Google Calendar não retornou id do evento.');
  return { eventId: id };
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const cal = encodeURIComponent(calendarId || 'primary');
  const response = await fetch(
    `${GOOGLE_CALENDAR}/calendars/${cal}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new Error(`Google Calendar DELETE falhou (HTTP ${response.status}).`);
  }
}

export async function getGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<{ startAt: Date; endAt: Date; summary?: string } | null> {
  const cal = encodeURIComponent(calendarId || 'primary');
  const response = await fetch(
    `${GOOGLE_CALENDAR}/calendars/${cal}/events/${encodeURIComponent(eventId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.status === 410) return null;
  const result = await parseJsonResponse(response);
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    throw new Error(`Google Calendar GET falhou (HTTP ${result.status}).`);
  }
  const data = result.body as {
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  const startRaw = data.start?.dateTime ?? data.start?.date;
  const endRaw = data.end?.dateTime ?? data.end?.date;
  if (!startRaw || !endRaw) return null;
  return {
    startAt: new Date(startRaw),
    endAt: new Date(endRaw),
    summary: data.summary,
  };
}

export function readCalendarId(configuration: unknown): string {
  if (configuration && typeof configuration === 'object' && !Array.isArray(configuration)) {
    const id = pickString(
      (configuration as Record<string, unknown>).calendarId,
      (configuration as Record<string, unknown>).GOOGLE_CALENDAR_ID,
    );
    if (id) return id;
  }
  return pickString(process.env.GOOGLE_CALENDAR_ID) || 'primary';
}

/** URL pública HTTPS do webhook push (env). Sem ela, só pull-sync manual. */
export function resolveGoogleCalendarWebhookUrl(): string {
  return pickString(process.env.GOOGLE_CALENDAR_WEBHOOK_URL);
}

export function resolveGoogleCalendarWebhookToken(
  configuration?: Record<string, unknown>,
): string {
  return pickString(
    configuration?.webhookChannelToken,
    process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN,
  );
}

export type GoogleWatchChannel = {
  channelId: string;
  resourceId: string;
  expiration?: string | null;
  token?: string | null;
};

export async function watchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  input: {
    channelId: string;
    address: string;
    token?: string;
    ttlMs?: number;
  },
): Promise<GoogleWatchChannel> {
  const cal = encodeURIComponent(calendarId || 'primary');
  const expiration = Date.now() + (input.ttlMs ?? 6 * 24 * 60 * 60 * 1000);
  const response = await fetch(`${GOOGLE_CALENDAR}/calendars/${cal}/events/watch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: input.channelId,
      type: 'web_hook',
      address: input.address,
      ...(input.token ? { token: input.token } : {}),
      expiration: String(expiration),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await parseJsonResponse(response);
  if (!result.ok || !result.body || typeof result.body !== 'object') {
    throw new Error(`Google Calendar watch falhou (HTTP ${result.status}).`);
  }
  const data = result.body as Record<string, unknown>;
  const resourceId = pickString(data.resourceId);
  if (!resourceId) throw new Error('Google Calendar watch não retornou resourceId.');
  return {
    channelId: pickString(data.id) || input.channelId,
    resourceId,
    expiration: pickString(data.expiration) || String(expiration),
    token: input.token ?? null,
  };
}

export async function stopGoogleCalendarChannel(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<void> {
  const response = await fetch(`${GOOGLE_CALENDAR}/channels/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: channelId, resourceId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new Error(`Google Calendar channels/stop falhou (HTTP ${response.status}).`);
  }
}

export function verifyGoogleWebhookHeaders(input: {
  channelId?: string;
  channelToken?: string;
  resourceState?: string;
  expectedToken?: string;
}): { ok: boolean; reason?: string; syncOnly?: boolean } {
  if (!input.channelId?.trim()) {
    return { ok: false, reason: 'X-Goog-Channel-ID ausente.' };
  }
  if (input.expectedToken) {
    const received = input.channelToken ?? '';
    const a = Buffer.from(received);
    const b = Buffer.from(input.expectedToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'Token do canal inválido.' };
    }
  }
  const state = (input.resourceState ?? '').toLowerCase();
  if (state === 'sync') return { ok: true, syncOnly: true };
  return { ok: true };
}

export async function testGoogleCalendarAccess(
  accessToken: string,
  calendarId: string,
): Promise<{ success: boolean; message: string; detail?: unknown }> {
  const cal = encodeURIComponent(calendarId || 'primary');
  try {
    const response = await fetch(`${GOOGLE_CALENDAR}/calendars/${cal}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const result = await parseJsonResponse(response);
    return {
      success: result.ok,
      message: result.ok
        ? 'Google Calendar acessível com token OAuth.'
        : `Falha ao acessar calendário (HTTP ${result.status}).`,
      detail: result.body,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao contatar Google Calendar: ${error instanceof Error ? error.message : 'desconhecido'}`,
    };
  }
}

import { envelopeDecryptJson, envelopeEncryptJson } from '@sonder/observability';

export type GoogleOAuthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
};

function pick(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function encryptIntegrationCredentials(value: Record<string, string>): string {
  return envelopeEncryptJson(value);
}

export function decryptIntegrationCredentials(payload: string): Record<string, string> {
  return envelopeDecryptJson(payload);
}

export function resolveGoogleOAuth(credentials: Record<string, string>): GoogleOAuthEnv | null {
  const clientId = pick(credentials.clientId, process.env.GOOGLE_CLIENT_ID);
  const clientSecret = pick(credentials.clientSecret, process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = pick(process.env.GOOGLE_REDIRECT_URI, credentials.redirectUri);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function readTokens(credentials: Record<string, string>): GoogleTokens | null {
  const accessToken = pick(credentials.accessToken, credentials.access_token);
  const refreshToken = pick(credentials.refreshToken, credentials.refresh_token);
  const expiryDate = Number(pick(credentials.expiryDate, credentials.expiry_date) || '0');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, expiryDate: Number.isFinite(expiryDate) ? expiryDate : 0 };
}

export function readCalendarId(configuration: unknown): string {
  if (configuration && typeof configuration === 'object' && !Array.isArray(configuration)) {
    const id = pick(
      (configuration as Record<string, unknown>).calendarId,
      (configuration as Record<string, unknown>).GOOGLE_CALENDAR_ID,
    );
    if (id) return id;
  }
  return pick(process.env.GOOGLE_CALENDAR_ID) || 'primary';
}

export function isGoogleCalendarMock(): boolean {
  return (process.env.GOOGLE_CALENDAR_MOCK ?? 'true').toLowerCase() === 'true';
}

async function refreshAccessToken(
  oauth: GoogleOAuthEnv,
  refreshToken: string,
): Promise<{ accessToken: string; expiryDate: number; refreshToken?: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Refresh Google falhou (HTTP ${response.status}).`);
  }
  const accessToken = pick(body.access_token);
  if (!accessToken) throw new Error('Google não retornou access_token.');
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken,
    expiryDate: Date.now() + expiresIn * 1000,
    refreshToken: pick(body.refresh_token) || undefined,
  };
}

export async function ensureAccessToken(
  oauth: GoogleOAuthEnv,
  credentials: Record<string, string>,
): Promise<{ accessToken: string; credentials: Record<string, string>; refreshed: boolean }> {
  const tokens = readTokens(credentials);
  if (!tokens) throw new Error('Sem refresh_token Google — conclua OAuth.');
  if (tokens.expiryDate > Date.now() + 60_000) {
    return { accessToken: tokens.accessToken, credentials, refreshed: false };
  }
  const refreshed = await refreshAccessToken(oauth, tokens.refreshToken);
  return {
    accessToken: refreshed.accessToken,
    credentials: {
      ...credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
      expiryDate: String(refreshed.expiryDate),
    },
    refreshed: true,
  };
}

export async function upsertCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId?: string | null;
  summary: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timeZone?: string;
  appointmentId: string;
}): Promise<string> {
  const cal = encodeURIComponent(input.calendarId || 'primary');
  const body = JSON.stringify({
    summary: input.summary,
    description: input.description ?? '',
    start: {
      dateTime: input.startAt.toISOString(),
      timeZone: input.timeZone || 'America/Cuiaba',
    },
    end: {
      dateTime: input.endAt.toISOString(),
      timeZone: input.timeZone || 'America/Cuiaba',
    },
    extendedProperties: {
      private: { appointmentId: input.appointmentId, source: 'sonder-clinic' },
    },
  });
  const url = input.eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(input.eventId)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;
  const response = await fetch(url, {
    method: input.eventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string };
  if (!response.ok || !data.id) {
    throw new Error(`Google Calendar upsert falhou (HTTP ${response.status}).`);
  }
  return data.id;
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const cal = encodeURIComponent(calendarId || 'primary');
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new Error(`Google Calendar delete falhou (HTTP ${response.status}).`);
  }
}

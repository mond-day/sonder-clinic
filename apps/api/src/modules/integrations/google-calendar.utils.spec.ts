import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGoogleAuthorizeUrl,
  isGoogleCalendarMock,
  isSonderClinicSyncedEvent,
  mergeTokenCredentials,
  rangesOverlap,
  readCalendarId,
  resolveCanonicalGoogleRedirectUri,
  resolveGoogleOAuthCredentials,
  signOAuthState,
  tokensFromCredentials,
  verifyOAuthState,
} from './google-calendar.utils';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('google-calendar.utils', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolveGoogleOAuthCredentials exige clientId e secret (redirect canônico em dev)', () => {
    expect(resolveGoogleOAuthCredentials()).toBeNull();

    vi.stubEnv('GOOGLE_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    expect(resolveGoogleOAuthCredentials()).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:4000/api/v1/integrations/google/callback',
    });
  });

  it('aceita clientId/secret só da conexão sem GOOGLE_CLIENT_* no env', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      resolveGoogleOAuthCredentials({ clientId: 'ui-id', clientSecret: 'ui-secret' }),
    ).toEqual({
      clientId: 'ui-id',
      clientSecret: 'ui-secret',
      redirectUri: 'http://localhost:4000/api/v1/integrations/google/callback',
    });
  });

  it('preferência de credenciais da conexão sobre env', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'env-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'env-secret');
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost/cb');
    expect(
      resolveGoogleOAuthCredentials({ clientId: 'conn-id', clientSecret: 'conn-secret' }),
    ).toMatchObject({ clientId: 'conn-id', clientSecret: 'conn-secret', redirectUri: 'http://localhost/cb' });
  });

  it('override de redirectUri da conexão tem prioridade sobre env', () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'https://api.env.example/api/v1/integrations/google/callback');
    expect(
      resolveGoogleOAuthCredentials({
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'https://api.conn.example/api/v1/integrations/google/callback',
      }),
    ).toMatchObject({
      redirectUri: 'https://api.conn.example/api/v1/integrations/google/callback',
    });
  });

  it('resolveCanonicalGoogleRedirectUri deriva de API_URL com ou sem /api/v1', () => {
    expect(resolveCanonicalGoogleRedirectUri({
      API_URL: 'https://api.example.com/api/v1',
    } as NodeJS.ProcessEnv)).toBe('https://api.example.com/api/v1/integrations/google/callback');
    expect(resolveCanonicalGoogleRedirectUri({
      API_URL: 'https://api.example.com',
    } as NodeJS.ProcessEnv)).toBe('https://api.example.com/api/v1/integrations/google/callback');
    expect(resolveCanonicalGoogleRedirectUri({
      GOOGLE_REDIRECT_URI: 'https://custom.example/cb',
      API_URL: 'https://api.example.com/api/v1',
    } as NodeJS.ProcessEnv)).toBe('https://custom.example/cb');
  });

  it('assina e verifica state OAuth', () => {
    const state = signOAuthState('conn-1', SECRET);
    expect(verifyOAuthState(state, SECRET)).toEqual({ connectionId: 'conn-1' });
    expect(verifyOAuthState(`${state}x`, SECRET)).toBeNull();
    expect(verifyOAuthState('bad.state', SECRET)).toBeNull();
  });

  it('buildGoogleAuthorizeUrl inclui offline + consent', () => {
    const url = buildGoogleAuthorizeUrl(
      {
        clientId: 'cid',
        clientSecret: 'sec',
        redirectUri: 'http://localhost/cb',
      },
      'state-value',
    );
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(url).toContain('state=state-value');
  });

  it('tokensFromCredentials e mergeTokenCredentials', () => {
    expect(tokensFromCredentials({ clientId: 'x' })).toBeNull();
    const merged = mergeTokenCredentials(
      { clientId: 'c', clientSecret: 's' },
      { accessToken: 'a', refreshToken: 'r', expiryDate: 99 },
    );
    expect(tokensFromCredentials(merged)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiryDate: 99,
    });
  });

  it('readCalendarId e mock flag', () => {
    expect(readCalendarId({})).toBe('primary');
    expect(readCalendarId({ calendarId: 'clinic-cal' })).toBe('clinic-cal');
    vi.stubEnv('GOOGLE_CALENDAR_MOCK', 'false');
    expect(isGoogleCalendarMock()).toBe(false);
  });

  it('identifica eventos sincronizados pela clínica e sobreposição', () => {
    expect(isSonderClinicSyncedEvent({ clinicSource: 'sonder-clinic' })).toBe(true);
    expect(isSonderClinicSyncedEvent({ clinicAppointmentId: 'appt-1' })).toBe(true);
    expect(isSonderClinicSyncedEvent({ clinicSource: 'other' })).toBe(false);
    const aStart = new Date('2026-08-11T12:00:00.000Z');
    const aEnd = new Date('2026-08-11T13:00:00.000Z');
    expect(rangesOverlap(aStart, aEnd, new Date('2026-08-11T12:30:00.000Z'), new Date('2026-08-11T14:00:00.000Z'))).toBe(true);
    expect(rangesOverlap(aStart, aEnd, new Date('2026-08-11T13:00:00.000Z'), new Date('2026-08-11T14:00:00.000Z'))).toBe(false);
  });

  it('verifyGoogleWebhookHeaders valida token e sync', async () => {
    const { verifyGoogleWebhookHeaders, resolveGoogleCalendarWebhookUrl } = await import('./google-calendar.utils.js');
    expect(verifyGoogleWebhookHeaders({ channelId: 'c1', resourceState: 'sync' }).ok).toBe(false);
    expect(verifyGoogleWebhookHeaders({
      channelId: 'c1',
      channelToken: 'tok',
      expectedToken: 'tok',
      resourceState: 'sync',
    })).toEqual({ ok: true, syncOnly: true });
    expect(verifyGoogleWebhookHeaders({
      channelId: 'c1',
      channelToken: 'tok',
      expectedToken: 'tok',
      resourceState: 'exists',
    })).toEqual({ ok: true });
    expect(verifyGoogleWebhookHeaders({
      channelId: 'c1',
      channelToken: 'bad',
      expectedToken: 'tok',
    }).ok).toBe(false);
    vi.stubEnv('GOOGLE_CALENDAR_WEBHOOK_URL', 'https://api.example.com/hook');
    expect(resolveGoogleCalendarWebhookUrl()).toBe('https://api.example.com/hook');
  });
});

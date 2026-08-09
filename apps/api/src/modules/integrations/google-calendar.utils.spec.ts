import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGoogleAuthorizeUrl,
  isGoogleCalendarMock,
  mergeTokenCredentials,
  readCalendarId,
  resolveGoogleOAuthCredentials,
  signOAuthState,
  tokensFromCredentials,
  verifyOAuthState,
} from './google-calendar.utils';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('google-calendar.utils', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolveGoogleOAuthCredentials exige clientId, secret e redirect', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    expect(resolveGoogleOAuthCredentials()).toBeNull();

    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:4000/api/v1/integrations/google/callback');
    expect(resolveGoogleOAuthCredentials()).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:4000/api/v1/integrations/google/callback',
    });
  });

  it('preferência de credenciais da conexão sobre env', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'env-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'env-secret');
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost/cb');
    expect(
      resolveGoogleOAuthCredentials({ clientId: 'conn-id', clientSecret: 'conn-secret' }),
    ).toMatchObject({ clientId: 'conn-id', clientSecret: 'conn-secret' });
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

  it('verifyGoogleWebhookHeaders valida token e sync', async () => {
    const { verifyGoogleWebhookHeaders, resolveGoogleCalendarWebhookUrl } = await import('./google-calendar.utils');
    expect(verifyGoogleWebhookHeaders({ channelId: 'c1', resourceState: 'sync' })).toEqual({
      ok: true,
      syncOnly: true,
    });
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isGoogleCalendarMock,
  readCalendarId,
  readTokens,
  resolveGoogleOAuth,
} from './google-calendar';

describe('google-calendar worker helpers', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolveGoogleOAuth exige redirect', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    expect(resolveGoogleOAuth({})).toBeNull();
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost/cb');
    expect(resolveGoogleOAuth({})).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost/cb',
    });
  });

  it('readTokens e calendarId', () => {
    expect(readTokens({ clientId: 'x' })).toBeNull();
    expect(readTokens({ accessToken: 'a', refreshToken: 'r', expiryDate: '10' })).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiryDate: 10,
    });
    expect(readCalendarId({ calendarId: 'cal-1' })).toBe('cal-1');
  });

  it('mock default true', () => {
    expect(isGoogleCalendarMock()).toBe(true);
    vi.stubEnv('GOOGLE_CALENDAR_MOCK', 'false');
    expect(isGoogleCalendarMock()).toBe(false);
  });
});

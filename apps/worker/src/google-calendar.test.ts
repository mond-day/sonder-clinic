import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isGoogleCalendarMock,
  readCalendarId,
  readTokens,
  resolveGoogleOAuth,
  selectGoogleCalendarConnectionForAppointment,
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

describe('selectGoogleCalendarConnectionForAppointment', () => {
  const connections = [
    { id: 'clinic', scopeType: 'CLINIC', scopeId: 'clinic-1' },
    { id: 'ana', scopeType: 'PROFESSIONAL', scopeId: 'pro-ana' },
    { id: 'bruno', scopeType: 'PROFESSIONAL', scopeId: 'pro-bruno' },
  ];

  it('usa só a conexão do profissional da consulta', () => {
    expect(selectGoogleCalendarConnectionForAppointment(connections, 'pro-ana')?.id).toBe('ana');
    expect(selectGoogleCalendarConnectionForAppointment(connections, 'pro-bruno')?.id).toBe('bruno');
  });

  it('sem conexão do profissional, cai na agenda da clínica e ignora o outro profissional', () => {
    const withoutAna = connections.filter((item) => item.id !== 'ana');
    expect(selectGoogleCalendarConnectionForAppointment(withoutAna, 'pro-ana')?.id).toBe('clinic');
  });

  it('não usa a conta de outro profissional quando não há agenda da clínica', () => {
    const professionals = connections.filter((item) => item.scopeType === 'PROFESSIONAL');
    expect(selectGoogleCalendarConnectionForAppointment(professionals, 'pro-carla')).toBeNull();
  });
});

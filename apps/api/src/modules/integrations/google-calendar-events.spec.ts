import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anyGoogleCalendarOauthReady,
  mergePersonalGoogleEvents,
  selectGoogleCalendarsToLoad,
} from './google-calendar-events';

const connections = [
  { id: 'clinic', scopeType: 'CLINIC', scopeId: 'clinic-1' },
  { id: 'ana', scopeType: 'PROFESSIONAL', scopeId: 'pro-ana' },
  { id: 'bruno', scopeType: 'PROFESSIONAL', scopeId: 'pro-bruno' },
];

describe('selectGoogleCalendarsToLoad', () => {
  it('sem filtro une clínica e todos os profissionais', () => {
    expect(selectGoogleCalendarsToLoad(connections).map((item) => item.id)).toEqual([
      'clinic',
      'ana',
      'bruno',
    ]);
  });

  it('com filtro inclui clínica e só aquele profissional', () => {
    expect(selectGoogleCalendarsToLoad(connections, 'pro-ana').map((item) => item.id)).toEqual([
      'clinic',
      'ana',
    ]);
  });
});

describe('mergePersonalGoogleEvents', () => {
  it('une agendas e remove evento repetido pelo id', () => {
    const merged = mergePersonalGoogleEvents([
      {
        calendarOwner: 'clinic',
        calendarOwnerName: 'Clínica',
        events: [
          { id: 'shared', summary: 'Reunião', startAt: 'a', endAt: 'b', allDay: false },
          { id: 'clinic-only', summary: 'Almoço', startAt: 'a', endAt: 'b', allDay: false },
        ],
      },
      {
        calendarOwner: 'professional',
        calendarOwnerName: 'Ana',
        events: [
          { id: 'shared', summary: 'Reunião (cópia)', startAt: 'a', endAt: 'b', allDay: false },
          { id: 'ana-only', summary: 'Consulta particular', startAt: 'a', endAt: 'b', allDay: false },
        ],
      },
    ]);

    expect(merged.map((item) => item.id)).toEqual(['shared', 'clinic-only', 'ana-only']);
    expect(merged[0]).toMatchObject({
      calendarOwner: 'clinic',
      calendarOwnerName: 'Clínica',
      source: 'google_personal',
    });
    expect(merged[2]).toMatchObject({
      calendarOwner: 'professional',
      calendarOwnerName: 'Ana',
    });
  });
});

describe('anyGoogleCalendarOauthReady', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('considera conexão de profissional com OAuth pronto', () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost/cb');
    expect(
      anyGoogleCalendarOauthReady([
        {
          credentials: {
            clientId: 'id',
            clientSecret: 'secret',
            accessToken: 'token',
            refreshToken: 'refresh',
            expiryDate: '9999999999999',
          },
        },
      ]),
    ).toBe(true);
  });

  it('não marca como pronta conexão sem refresh', () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost/cb');
    expect(
      anyGoogleCalendarOauthReady([
        { credentials: { clientId: 'id', clientSecret: 'secret' } },
      ]),
    ).toBe(false);
  });
});

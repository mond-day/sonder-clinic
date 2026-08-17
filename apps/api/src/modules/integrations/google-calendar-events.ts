import {
  resolveGoogleOAuthCredentials,
  tokensFromCredentials,
} from './google-calendar.utils';

export type GoogleCalendarScopeConnection = {
  id: string;
  scopeType: string;
  scopeId: string;
};

export type PersonalGoogleEventInput = {
  id: string;
  summary: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
};

export type MergedPersonalGoogleEvent = PersonalGoogleEventInput & {
  source: 'google_personal';
  calendarOwner: 'clinic' | 'professional';
  calendarOwnerName: string;
};

export function isClinicScopedGoogleCalendar(scopeType: string) {
  return scopeType !== 'PROFESSIONAL';
}

export function googleCalendarConnectionOauthReady(credentials: Record<string, string>) {
  return Boolean(resolveGoogleOAuthCredentials(credentials) && tokensFromCredentials(credentials));
}

export function anyGoogleCalendarOauthReady(
  connections: Array<{ credentials: Record<string, string> }>,
) {
  return connections.some((item) => googleCalendarConnectionOauthReady(item.credentials));
}

/** Clínica + profissional filtrado; sem filtro, clínica + todos os profissionais conectados. */
export function selectGoogleCalendarsToLoad<T extends GoogleCalendarScopeConnection>(
  connections: T[],
  professionalId?: string,
): T[] {
  const clinicOwned = connections.filter((item) => isClinicScopedGoogleCalendar(item.scopeType));
  const professionalOwned = connections.filter((item) => item.scopeType === 'PROFESSIONAL');
  if (professionalId) {
    return [
      ...clinicOwned,
      ...professionalOwned.filter((item) => item.scopeId === professionalId),
    ];
  }
  return [...clinicOwned, ...professionalOwned];
}

export function mergePersonalGoogleEvents(
  batches: Array<{
    calendarOwner: 'clinic' | 'professional';
    calendarOwnerName: string;
    events: PersonalGoogleEventInput[];
  }>,
): MergedPersonalGoogleEvent[] {
  const seen = new Set<string>();
  const merged: MergedPersonalGoogleEvent[] = [];
  for (const batch of batches) {
    for (const event of batch.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push({
        ...event,
        source: 'google_personal',
        calendarOwner: batch.calendarOwner,
        calendarOwnerName: batch.calendarOwnerName,
      });
    }
  }
  return merged;
}

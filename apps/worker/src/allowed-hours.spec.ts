import { describe, expect, it } from 'vitest';
import { isWithinAllowedHours, nextAllowedWindowStart, normalizeAllowedHours } from './allowed-hours';

describe('allowedHours', () => {
  it('empty config is always allowed', () => {
    expect(isWithinAllowedHours({})).toBe(true);
    expect(isWithinAllowedHours(null)).toBe(true);
    expect(normalizeAllowedHours({})).toBeNull();
  });

  it('rejects weekday outside list', () => {
    // 2026-08-07 was a Friday (weekday 5) — use a fixed UTC instant and America/Cuiaba
    const fridayMorning = new Date('2026-08-07T12:00:00.000Z'); // ~08:00 Cuiaba (UTC-4)
    expect(isWithinAllowedHours({
      start: '08:00',
      end: '18:00',
      weekdays: [1, 2, 3, 4], // mon-thu only
      timezone: 'America/Cuiaba',
    }, fridayMorning)).toBe(false);
  });

  it('accepts weekday inside window', () => {
    const fridayMorning = new Date('2026-08-07T12:00:00.000Z');
    expect(isWithinAllowedHours({
      start: '08:00',
      end: '18:00',
      weekdays: [1, 2, 3, 4, 5],
      timezone: 'America/Cuiaba',
    }, fridayMorning)).toBe(true);
  });

  it('rejects time outside window', () => {
    const late = new Date('2026-08-07T01:00:00.000Z'); // ~21:00 previous day Cuiaba
    expect(isWithinAllowedHours({
      start: '08:00',
      end: '18:00',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timezone: 'America/Cuiaba',
    }, late)).toBe(false);
  });

  it('nextAllowedWindowStart returns a future date when outside', () => {
    const late = new Date('2026-08-07T01:00:00.000Z');
    const next = nextAllowedWindowStart({
      start: '08:00',
      end: '18:00',
      weekdays: [1, 2, 3, 4, 5],
      timezone: 'America/Cuiaba',
    }, late);
    expect(next.getTime()).toBeGreaterThan(late.getTime());
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildInviteEmail,
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
} from './users-invitations.utils';

describe('users-invitations.utils', () => {
  it('hashes tokens deterministically', () => {
    const token = 'abc123';
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toBe(token);
  });

  it('generates opaque invite tokens', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toHaveLength(48);
    expect(a).not.toBe(b);
  });

  it('builds invite URL and email copy', () => {
    const url = buildInviteUrl('http://localhost:3000/', 'tok');
    expect(url).toBe('http://localhost:3000/login?inviteToken=tok');
    const mail = buildInviteEmail({
      name: 'Ana',
      organizationName: 'Sonder Clinic',
      inviteUrl: url,
      expiresAt: new Date('2026-08-10T12:00:00.000Z'),
    });
    expect(mail.subject).toContain('Sonder Clinic');
    expect(mail.text).toContain(url);
    expect(mail.text).toContain('Ana');
  });

  it('computes expiry in the future', () => {
    const before = Date.now();
    const expires = inviteExpiresAt(24);
    expect(expires.getTime()).toBeGreaterThan(before + 23 * 3600_000);
  });
});

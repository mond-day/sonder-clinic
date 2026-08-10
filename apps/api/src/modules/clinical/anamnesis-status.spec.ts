import { describe, expect, it } from 'vitest';
import { effectiveAnamnesisStatus } from './anamnesis-status';

describe('effectiveAnamnesisStatus', () => {
  const now = new Date('2026-08-09T12:00:00.000Z');

  it('preserva status terminais', () => {
    expect(effectiveAnamnesisStatus({ status: 'DRAFT' }, now)).toBe('DRAFT');
    expect(effectiveAnamnesisStatus({ status: 'AWAITING_SIGNATURE' }, now)).toBe('AWAITING_SIGNATURE');
    expect(effectiveAnamnesisStatus({ status: 'SUPERSEDED' }, now)).toBe('SUPERSEDED');
    expect(effectiveAnamnesisStatus({ status: 'CANCELLED' }, now)).toBe('CANCELLED');
    expect(effectiveAnamnesisStatus({ status: 'EXPIRED' }, now)).toBe('EXPIRED');
  });

  it('SIGNED vigente permanece SIGNED', () => {
    expect(effectiveAnamnesisStatus({
      status: 'SIGNED',
      validUntil: new Date('2026-12-01'),
    }, now)).toBe('SIGNED');
  });

  it('SIGNED vencido vira EXPIRED efetivo', () => {
    expect(effectiveAnamnesisStatus({
      status: 'SIGNED',
      validUntil: new Date('2026-01-01'),
    }, now)).toBe('EXPIRED');
  });
});

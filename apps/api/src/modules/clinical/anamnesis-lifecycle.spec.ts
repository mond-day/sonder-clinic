import { describe, expect, it } from 'vitest';
import {
  assertOriginStillReplaceable,
  canCreateUpdateFrom,
  nextStatusesOnFinalizeUpdate,
  originAfterCreateUpdate,
} from './anamnesis-lifecycle';

const origin = {
  id: 'A',
  status: 'SIGNED',
  supersededById: null as string | null,
  organizationId: 'org-1',
};

describe('anamnesis lifecycle (update/supersede)', () => {
  it('SIGNED A + create update → A permanece SIGNED; B seria DRAFT', () => {
    expect(canCreateUpdateFrom('SIGNED')).toBe(true);
    expect(originAfterCreateUpdate('SIGNED')).toBe('SIGNED');
  });

  it('delete B → A continua SIGNED (origem nunca alterada no create)', () => {
    expect(originAfterCreateUpdate(origin.status)).toBe('SIGNED');
  });

  it('finalize B → A SUPERSEDED + B SIGNED', () => {
    const result = nextStatusesOnFinalizeUpdate({
      origin,
      draft: {
        id: 'B',
        status: 'AWAITING_SIGNATURE',
        sourceResponseId: 'A',
        organizationId: 'org-1',
      },
    });
    expect(result).toEqual({
      originStatus: 'SUPERSEDED',
      draftStatus: 'SIGNED',
      supersededById: 'B',
    });
  });

  it('B e C de A; B finaliza; C tenta → 409', () => {
    const afterB = { ...origin, supersededById: 'B', status: 'SUPERSEDED' };
    expect(() => assertOriginStillReplaceable(afterB, 'C')).toThrow(/CONFLICT_ALREADY_SUPERSEDED/);
    expect(() => nextStatusesOnFinalizeUpdate({
      origin: afterB,
      draft: {
        id: 'C',
        status: 'AWAITING_SIGNATURE',
        sourceResponseId: 'A',
        organizationId: 'org-1',
      },
    })).toThrow(/CONFLICT_ALREADY_SUPERSEDED/);
  });

  it('EXPIRED também permite criar atualização', () => {
    expect(canCreateUpdateFrom('EXPIRED')).toBe(true);
    expect(canCreateUpdateFrom('SIGNED', 'EXPIRED')).toBe(true);
    expect(canCreateUpdateFrom('DRAFT')).toBe(false);
  });
});

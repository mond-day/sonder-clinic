import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateMany, payableCreate, receivableCreate, Decimal } = vi.hoisted(() => {
  class DecimalMock {
    constructor(public value: string) {}
    toString() { return this.value; }
  }
  return {
    updateMany: vi.fn(),
    payableCreate: vi.fn(),
    receivableCreate: vi.fn(),
    Decimal: DecimalMock,
  };
});

vi.mock('@sonder/database', () => ({
  Prisma: { Decimal },
  prisma: {
    financeRecurrence: { findMany: vi.fn(), updateMany },
    payable: { create: payableCreate },
    receivable: { create: receivableCreate },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        financeRecurrence: { updateMany },
        payable: { create: payableCreate },
        receivable: { create: receivableCreate },
      };
      return fn(tx);
    }),
  },
}));

import { materialize } from './finance-recurrences';
import { Prisma } from '@sonder/database';

describe('finance-recurrences claim atômico', () => {
  const recurrence = {
    id: 'rec-1',
    organizationId: 'org-1',
    clinicId: 'clinic-1',
    kind: 'PAYABLE',
    description: 'Aluguel',
    amount: new Prisma.Decimal('100.00'),
    frequency: 'MONTHLY',
    interval: 1,
    nextOccurrence: new Date('2026-08-01T00:00:00.000Z'),
    endsAt: null,
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    payableCreate.mockResolvedValue({ id: 'pay-1' });
  });

  it('duas materializações simultâneas → um lançamento só', async () => {
    let claimed = false;
    updateMany.mockImplementation(async () => {
      if (!claimed) {
        claimed = true;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const results = await Promise.all([
      materialize(recurrence),
      materialize(recurrence),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((ok) => !ok)).toHaveLength(1);
    expect(payableCreate).toHaveBeenCalledTimes(1);
  });
});

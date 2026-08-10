import { describe, expect, it } from 'vitest';
import {
  allocateClinicalProductionByProcedure,
  allocateClinicalProductionByProfessional,
  allocateReceiptByProcedure,
  sessionClinicalWeight,
  type ProductionSessionInput,
} from './production-by-procedure';

const from = new Date('2026-08-01T00:00:00.000Z');
const to = new Date('2026-08-31T23:59:59.000Z');

function session(partial: Partial<ProductionSessionInput> & { id: string }): ProductionSessionInput {
  return {
    correctionOfId: null,
    completedAt: new Date('2026-08-10T12:00:00.000Z'),
    treatmentPlanId: 'plan-1',
    procedureId: 'proc-1',
    procedureName: 'Restauração',
    procedureCode: 'R01',
    itemTotal: 1000,
    plannedSessions: 2,
    professionalId: 'pro-1',
    ...partial,
  };
}

describe('produção clínica por procedimento', () => {
  it('0 sessões → 0', () => {
    expect(allocateClinicalProductionByProcedure({ sessions: [], from, to })).toEqual([]);
  });

  it('1 sessão → 500 (1000/2)', () => {
    const rows = allocateClinicalProductionByProcedure({
      sessions: [session({ id: 's1' })],
      from,
      to,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(500);
  });

  it('2 sessões → 1000', () => {
    const rows = allocateClinicalProductionByProcedure({
      sessions: [
        session({ id: 's1' }),
        session({ id: 's2', completedAt: new Date('2026-08-15') }),
      ],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(2);
    expect(rows[0]!.total).toBe(1000);
  });

  it('sessão + correção → 500 (correção não conta)', () => {
    const rows = allocateClinicalProductionByProcedure({
      sessions: [
        session({ id: 's1' }),
        session({ id: 's1-corr', correctionOfId: 's1', completedAt: new Date('2026-08-12') }),
      ],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(500);
  });
});

describe('recebimento por procedimento', () => {
  it('sem pagamento → 0', () => {
    const rows = allocateReceiptByProcedure({
      sessions: [session({ id: 's1' })],
      payments: [],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(0);
  });

  it('pagamento parcial alocado à sessão', () => {
    const rows = allocateReceiptByProcedure({
      sessions: [session({ id: 's1' })],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 400 }],
      from,
      to,
    });
    expect(rows[0]!.total).toBe(400);
  });

  it('pagamento total com 2 sessões', () => {
    const rows = allocateReceiptByProcedure({
      sessions: [
        session({ id: 's1' }),
        session({ id: 's2', completedAt: new Date('2026-08-15') }),
      ],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 1000 }],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(2);
    expect(rows[0]!.total).toBe(1000);
  });

  it('correção não duplica recebimento', () => {
    const rows = allocateReceiptByProcedure({
      sessions: [
        session({ id: 's1' }),
        session({ id: 's1-corr', correctionOfId: 's1', completedAt: new Date('2026-08-12') }),
      ],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 800 }],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(800);
  });
});

describe('produção por profissional', () => {
  it('correctionOfId != null → não contar', () => {
    const rows = allocateClinicalProductionByProfessional({
      sessions: [
        session({ id: 's1', professionalId: 'pro-1' }),
        session({ id: 's1-corr', correctionOfId: 's1', professionalId: 'pro-1' }),
      ],
      from,
      to,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(500);
  });
});

describe('sessionClinicalWeight', () => {
  it('divide pelo plannedSessions', () => {
    expect(sessionClinicalWeight(1000, 2)).toBe(500);
    expect(sessionClinicalWeight(1000, 0)).toBe(1000);
  });
});

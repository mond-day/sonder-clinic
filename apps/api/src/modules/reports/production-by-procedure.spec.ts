import { describe, expect, it } from 'vitest';
import {
  allocateProductionByProcedure,
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
    ...partial,
  };
}

describe('production-by-procedure', () => {
  it('caso 1: plano aprovado sem sessão → produção 0', () => {
    const rows = allocateProductionByProcedure({
      sessions: [],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 500 }],
      from,
      to,
    });
    expect(rows).toEqual([]);
  });

  it('caso 2: 1 sessão elegível recebe o valor recebido do plano', () => {
    const rows = allocateProductionByProcedure({
      sessions: [session({ id: 's1', plannedSessions: 2, itemTotal: 1000 })],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 1000 }],
      from,
      to,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sessions).toBe(1);
    expect(rows[0]!.total).toBe(1000);
  });

  it('caso 3: 2 sessões somam o recebido integral', () => {
    const rows = allocateProductionByProcedure({
      sessions: [
        session({ id: 's1', plannedSessions: 2, itemTotal: 1000 }),
        session({ id: 's2', plannedSessions: 2, itemTotal: 1000, completedAt: new Date('2026-08-15') }),
      ],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 1000 }],
      from,
      to,
    });
    expect(rows[0]!.sessions).toBe(2);
    expect(rows[0]!.total).toBe(1000);
  });

  it('caso 4: correção não duplica produção', () => {
    const rows = allocateProductionByProcedure({
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

  it('sessão fora do período não conta', () => {
    const rows = allocateProductionByProcedure({
      sessions: [session({ id: 's1', completedAt: new Date('2026-07-01') })],
      payments: [{ treatmentPlanId: 'plan-1', netReceived: 1000 }],
      from,
      to,
    });
    expect(rows).toEqual([]);
  });

  it('sessionClinicalWeight divide pelo plannedSessions', () => {
    expect(sessionClinicalWeight(1000, 2)).toBe(500);
    expect(sessionClinicalWeight(1000, 0)).toBe(1000);
  });
});

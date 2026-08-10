/**
 * Relatórios de produção / recebimento por procedimento.
 *
 * Produção clínica: TreatmentSession.completedAt (sem correções);
 * valor = item.total / plannedSessions por sessão elegível.
 *
 * Recebimento: pagamentos líquidos confirmados alocados às sessões elegíveis.
 */

export type ProductionSessionInput = {
  id: string;
  correctionOfId: string | null;
  completedAt: Date;
  treatmentPlanId: string;
  procedureId: string;
  procedureName: string;
  procedureCode: string | null;
  itemTotal: number;
  plannedSessions: number;
  professionalId?: string | null;
};

export type ProductionPaymentInput = {
  treatmentPlanId: string;
  /** Valor líquido recebido (amount − refunds) com paidAt no período. */
  netReceived: number;
};

export type ProductionProcedureRow = {
  procedureId: string;
  procedure: string;
  internalCode: string | null;
  sessions: number;
  total: number;
};

export type ProductionProfessionalRow = {
  professionalId: string;
  sessions: number;
  total: number;
};

export function sessionClinicalWeight(itemTotal: number, plannedSessions: number): number {
  const planned = Math.max(1, Number(plannedSessions) || 1);
  const total = Number(itemTotal) || 0;
  return total / planned;
}

function eligibleSessions(
  sessions: ProductionSessionInput[],
  from: Date,
  to: Date,
): ProductionSessionInput[] {
  return sessions.filter((session) => {
    if (session.correctionOfId) return false;
    const at = session.completedAt instanceof Date
      ? session.completedAt
      : new Date(session.completedAt);
    return at >= from && at <= to;
  });
}

/** Produção clínica: valor = peso da sessão (item.total / plannedSessions). Independente de pagamento. */
export function allocateClinicalProductionByProcedure(input: {
  sessions: ProductionSessionInput[];
  from: Date;
  to: Date;
}): ProductionProcedureRow[] {
  const eligible = eligibleSessions(input.sessions, input.from, input.to);
  const grouped = new Map<string, ProductionProcedureRow>();
  for (const session of eligible) {
    const weight = sessionClinicalWeight(session.itemTotal, session.plannedSessions);
    const current = grouped.get(session.procedureId) ?? {
      procedureId: session.procedureId,
      procedure: session.procedureName,
      internalCode: session.procedureCode,
      sessions: 0,
      total: 0,
    };
    current.sessions += 1;
    current.total += weight;
    grouped.set(session.procedureId, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 }))
    .sort((a, b) => a.procedure.localeCompare(b.procedure));
}

/** Recebimento alocado: pagamentos líquidos rateados pelo peso clínico das sessões elegíveis. */
export function allocateReceiptByProcedure(input: {
  sessions: ProductionSessionInput[];
  payments: ProductionPaymentInput[];
  from: Date;
  to: Date;
}): ProductionProcedureRow[] {
  const eligible = eligibleSessions(input.sessions, input.from, input.to);

  const receivedByPlan = new Map<string, number>();
  for (const payment of input.payments) {
    receivedByPlan.set(
      payment.treatmentPlanId,
      (receivedByPlan.get(payment.treatmentPlanId) ?? 0) + Math.max(0, payment.netReceived),
    );
  }

  const weightsByPlan = new Map<string, number>();
  for (const session of eligible) {
    const weight = sessionClinicalWeight(session.itemTotal, session.plannedSessions);
    weightsByPlan.set(
      session.treatmentPlanId,
      (weightsByPlan.get(session.treatmentPlanId) ?? 0) + weight,
    );
  }

  const grouped = new Map<string, ProductionProcedureRow>();
  for (const session of eligible) {
    const planWeight = weightsByPlan.get(session.treatmentPlanId) ?? 0;
    const planReceived = receivedByPlan.get(session.treatmentPlanId) ?? 0;
    const weight = sessionClinicalWeight(session.itemTotal, session.plannedSessions);
    const allocated = planWeight > 0 ? (weight / planWeight) * planReceived : 0;

    const current = grouped.get(session.procedureId) ?? {
      procedureId: session.procedureId,
      procedure: session.procedureName,
      internalCode: session.procedureCode,
      sessions: 0,
      total: 0,
    };
    current.sessions += 1;
    current.total += allocated;
    grouped.set(session.procedureId, current);
  }

  return [...grouped.values()]
    .map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 }))
    .sort((a, b) => a.procedure.localeCompare(b.procedure));
}

/** @deprecated Prefer allocateClinicalProductionByProcedure / allocateReceiptByProcedure. */
export function allocateProductionByProcedure(input: {
  sessions: ProductionSessionInput[];
  payments: ProductionPaymentInput[];
  from: Date;
  to: Date;
}): ProductionProcedureRow[] {
  return allocateReceiptByProcedure(input);
}

export function allocateClinicalProductionByProfessional(input: {
  sessions: ProductionSessionInput[];
  from: Date;
  to: Date;
}): ProductionProfessionalRow[] {
  const eligible = eligibleSessions(input.sessions, input.from, input.to);
  const grouped = new Map<string, ProductionProfessionalRow>();
  for (const session of eligible) {
    const professionalId = session.professionalId;
    if (!professionalId) continue;
    const weight = sessionClinicalWeight(session.itemTotal, session.plannedSessions);
    const current = grouped.get(professionalId) ?? {
      professionalId,
      sessions: 0,
      total: 0,
    };
    current.sessions += 1;
    current.total += weight;
    grouped.set(professionalId, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

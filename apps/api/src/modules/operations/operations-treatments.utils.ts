export type TreatmentPlanStatus =
  | 'DRAFT'
  | 'PRESENTED'
  | 'PARTIALLY_APPROVED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TreatmentItemStatus =
  | 'PLANNED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

const PLAN_TRANSITIONS: Record<TreatmentPlanStatus, TreatmentPlanStatus[]> = {
  DRAFT: ['PRESENTED', 'CANCELLED'],
  PRESENTED: ['PARTIALLY_APPROVED', 'APPROVED', 'CANCELLED'],
  PARTIALLY_APPROVED: ['APPROVED', 'IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionPlan(from: TreatmentPlanStatus, to: TreatmentPlanStatus): boolean {
  if (from === to) return true;
  return PLAN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPlanTransition(from: TreatmentPlanStatus, to: TreatmentPlanStatus): void {
  if (!canTransitionPlan(from, to)) {
    throw new Error(`Transição de plano inválida: ${from} → ${to}.`);
  }
}

/** Conta apenas sessões “raiz” (não adendos/correções). */
export function countValidSessions(sessions: Array<{ correctionOfId?: string | null }>): number {
  return sessions.filter((session) => !session.correctionOfId).length;
}

export function nextItemStatusAfterSession(input: {
  currentStatus: TreatmentItemStatus;
  plannedSessions: number;
  validSessionCount: number;
  allowExtraSession?: boolean;
}): { status: TreatmentItemStatus; completed: boolean } {
  const planned = Math.max(1, input.plannedSessions);
  if (['CANCELLED', 'COMPLETED'].includes(input.currentStatus)) {
    throw new Error('Item cancelado ou concluído não aceita novas sessões.');
  }
  if (input.validSessionCount > planned && !input.allowExtraSession) {
    throw new Error('Sessões realizadas excedem o planejado. Use conclusão explícita ou justifique sessão extra.');
  }
  const completed = input.validSessionCount >= planned;
  if (completed) return { status: 'COMPLETED', completed: true };
  return { status: 'IN_PROGRESS', completed: false };
}

export function derivePlanStatusFromItems(items: Array<{ status: TreatmentItemStatus }>): TreatmentPlanStatus | null {
  if (!items.length) return null;
  const active = items.filter((item) => item.status !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  if (active.every((item) => item.status === 'COMPLETED')) return 'COMPLETED';
  if (active.some((item) => item.status === 'IN_PROGRESS' || item.status === 'COMPLETED')) return 'IN_PROGRESS';
  if (active.every((item) => item.status === 'APPROVED')) return 'APPROVED';
  if (active.some((item) => item.status === 'APPROVED')) return 'PARTIALLY_APPROVED';
  return null;
}

export function computeItemTotal(unitPrice: { mul: (n: number) => { sub: (d: unknown) => unknown } }, quantity: number, discount: unknown) {
  return unitPrice.mul(quantity).sub(discount);
}

export function planEditableStatuses(): TreatmentPlanStatus[] {
  return ['DRAFT', 'PRESENTED', 'PARTIALLY_APPROVED', 'APPROVED', 'IN_PROGRESS'];
}

export function planMutableContentStatuses(): TreatmentPlanStatus[] {
  return ['DRAFT'];
}

export function isTerminalPlan(status: TreatmentPlanStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

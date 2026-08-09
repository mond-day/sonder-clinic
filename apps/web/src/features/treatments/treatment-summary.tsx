'use client';

import { currency } from '@/lib/format';
import { ACTIVE_PLAN_STATUSES, PENDING_PLAN_STATUSES, type TreatmentPlan } from './treatment-types';

export function TreatmentSummary({ plans }: { plans: TreatmentPlan[] }) {
  const active = plans.filter((plan) => !plan.archivedAt && ACTIVE_PLAN_STATUSES.has(String(plan.status)));
  const pending = plans.filter((plan) => !plan.archivedAt && PENDING_PLAN_STATUSES.has(String(plan.status)));
  const completed = plans.filter((plan) => String(plan.status) === 'COMPLETED').length;
  const plannedValue = plans
    .filter((plan) => !plan.archivedAt && String(plan.status) !== 'CANCELLED')
    .reduce((sum, plan) => sum + Number(plan.total ?? 0), 0);

  return (
    <div className="treatment-mini-kpis" aria-label="Resumo de tratamentos">
      <div className="mini-kpi">
        <strong>{active.length}</strong>
        <span>ativos</span>
      </div>
      <div className="mini-kpi">
        <strong>{currency(plannedValue)}</strong>
        <span>planejado</span>
      </div>
      <div className="mini-kpi">
        <strong>{completed}</strong>
        <span>concluído{completed === 1 ? '' : 's'}</span>
      </div>
      <div className="mini-kpi">
        <strong>{pending.length}</strong>
        <span>aguardando aprovação</span>
      </div>
    </div>
  );
}

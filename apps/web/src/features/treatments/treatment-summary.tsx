'use client';

import { CheckCircle2, CircleDollarSign, ClipboardList, TriangleAlert } from 'lucide-react';
import { currency } from '@/lib/format';
import { MetricCard } from '@/components/ui';
import { ACTIVE_PLAN_STATUSES, PENDING_PLAN_STATUSES, type TreatmentPlan } from './treatment-types';

export function TreatmentSummary({ plans }: { plans: TreatmentPlan[] }) {
  const active = plans.filter((plan) => !plan.archivedAt && ACTIVE_PLAN_STATUSES.has(String(plan.status)));
  const pending = plans.filter((plan) => !plan.archivedAt && PENDING_PLAN_STATUSES.has(String(plan.status)));
  const completed = plans.filter((plan) => String(plan.status) === 'COMPLETED');
  const plannedValue = plans
    .filter((plan) => !plan.archivedAt && String(plan.status) !== 'CANCELLED')
    .reduce((sum, plan) => sum + Number(plan.total ?? 0), 0);
  const approvedValue = plans
    .filter((plan) => ['APPROVED', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_APPROVED'].includes(String(plan.status)))
    .reduce((sum, plan) => {
      const items = plan.items ?? [];
      const approvedItems = items.filter((item) => ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(String(item.status)));
      return sum + approvedItems.reduce((acc, item) => acc + Number(item.total ?? 0), 0);
    }, 0);

  return (
    <div className="metric-grid treatments-metrics">
      <MetricCard
        label="Tratamentos ativos"
        value={active.length}
        meta={`${pending.length} aguardando aprovação ou apresentação`}
        icon={<ClipboardList size={16} />}
        iconTone="blue"
      />
      <MetricCard
        label="Pendências"
        value={pending.length}
        meta="Aprovação ou apresentação"
        tone={pending.length ? 'amber' : 'green'}
        icon={<TriangleAlert size={16} />}
        iconTone="amber"
      />
      <MetricCard
        label="Concluídos"
        value={completed.length}
        meta="Histórico do paciente"
        icon={<CheckCircle2 size={16} />}
        iconTone="green"
      />
      <MetricCard
        label="Valor planejado"
        value={currency(plannedValue)}
        meta={`Aprovado estimado: ${currency(approvedValue)}`}
        icon={<CircleDollarSign size={16} />}
        iconTone="purple"
      />
    </div>
  );
}

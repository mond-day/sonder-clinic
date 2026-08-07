'use client';

import { currency, dateOnly, presentationLabel, statusTone, text } from '@/lib/format';
import { StatusBadge } from '@/components/ui';
import type { TreatmentPlan } from './treatment-types';

function planProgress(plan: TreatmentPlan) {
  const items = plan.items ?? [];
  if (!items.length) return 0;
  const done = items.filter((item) => String(item.status) === 'COMPLETED').length;
  return Math.round((done / items.length) * 100);
}

function sessionProgress(plan: TreatmentPlan) {
  const items = plan.items ?? [];
  const planned = items.reduce((sum, item) => sum + Number(item.plannedSessions ?? 1), 0);
  const done = items.reduce(
    (sum, item) => sum + (item.sessions ?? []).filter((session) => !session.correctionOfId).length,
    0,
  );
  return { done, planned };
}

export function TreatmentPlanCard({
  plan,
  active,
  professionalName,
  onSelect,
}: {
  plan: TreatmentPlan;
  active: boolean;
  professionalName?: string;
  onSelect: () => void;
}) {
  const items = plan.items ?? [];
  const pct = planProgress(plan);
  const sessions = sessionProgress(plan);

  return (
    <button
      type="button"
      className={`treatment-row ${active ? 'active' : ''} ${plan.archivedAt ? 'archived' : ''}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <div className="treatment-row-head">
        <h3>{text(plan.title)}</h3>
        <StatusBadge tone={statusTone(plan.status)}>{presentationLabel(plan.status)}</StatusBadge>
      </div>
      <p>
        {professionalName ?? 'Profissional'} · {items.length} procedimento(s) · {dateOnly(plan.createdAt)}
        {plan.archivedAt ? ' · Arquivado' : ''}
      </p>
      <div className="progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="row-meta">
        <span>{sessions.done}/{sessions.planned} sessões · {pct}% itens</span>
        <strong>{currency(plan.total)}</strong>
      </div>
    </button>
  );
}

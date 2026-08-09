'use client';

import { EmptyState } from '@/components/ui';
import { TreatmentPlanCard } from './treatment-plan-card';
import type { TreatmentPlan } from './treatment-types';

export function TreatmentPlanList({
  plans,
  selectedId,
  professionalName,
  onSelect,
}: {
  plans: TreatmentPlan[];
  selectedId: string | null;
  professionalName: (professionalId: string) => string;
  onSelect: (id: string) => void;
}) {
  if (!plans.length) {
    return (
      <EmptyState
        title="Nenhum plano neste filtro"
        description="Ajuste a busca ou crie um novo tratamento pelo botão acima."
      />
    );
  }

  return (
    <div className="treatment-list" role="listbox" aria-label="Planos de tratamento">
      {plans.map((plan) => (
        <TreatmentPlanCard
          key={plan.id}
          plan={plan}
          active={selectedId === plan.id}
          professionalName={professionalName(plan.professionalId)}
          onSelect={() => onSelect(plan.id)}
        />
      ))}
    </div>
  );
}

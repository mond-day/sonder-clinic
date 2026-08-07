'use client';

import type { TreatmentFiltersState } from './treatment-types';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'PRESENTED', label: 'Apresentado' },
  { value: 'PARTIALLY_APPROVED', label: 'Parcialmente aprovado' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

export function TreatmentFilters({
  value,
  onChange,
}: {
  value: TreatmentFiltersState;
  onChange: (next: TreatmentFiltersState) => void;
}) {
  return (
    <div className="treatment-filters">
      <input
        type="search"
        placeholder="Buscar tratamento ou procedimento"
        value={value.search}
        onChange={(event) => onChange({ ...value, search: event.target.value })}
        aria-label="Buscar tratamentos"
      />
      <select
        value={value.status}
        onChange={(event) => onChange({ ...value, status: event.target.value })}
        aria-label="Filtrar por status"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <label className="check-field compact">
        <input
          type="checkbox"
          checked={value.includeArchived}
          onChange={(event) => onChange({ ...value, includeArchived: event.target.checked })}
        />
        Incluir arquivados
      </label>
    </div>
  );
}

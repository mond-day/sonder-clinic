'use client';

import type { DocumentFiltersState, LibrarySegment } from './document-types';

const SEGMENTS: Array<{ id: LibrarySegment; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'generated', label: 'Gerados' },
  { id: 'uploads', label: 'Arquivos' },
];

export function DocumentFilters({
  value,
  onChange,
}: {
  value: DocumentFiltersState;
  onChange: (next: DocumentFiltersState) => void;
}) {
  return (
    <div className="document-filters">
      <input
        placeholder="Buscar por nome ou tipo"
        value={value.search}
        onChange={(event) => onChange({ ...value, search: event.target.value })}
        aria-label="Buscar na biblioteca"
      />
      <div className="segmented" role="tablist" aria-label="Segmento da biblioteca">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={value.segment === segment.id}
            className={value.segment === segment.id ? 'active' : ''}
            onClick={() => onChange({ ...value, segment: segment.id })}
          >
            {segment.label}
          </button>
        ))}
      </div>
      <label className="switch-row">
        <span className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={value.includeArchived}
            onChange={(event) => onChange({ ...value, includeArchived: event.target.checked })}
            aria-label="Incluir arquivados"
          />
          <span className="switch-track" aria-hidden />
        </span>
        Incluir arquivados
      </label>
    </div>
  );
}

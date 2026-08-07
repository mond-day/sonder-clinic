'use client';

import { Plus } from 'lucide-react';

export function TreatmentToolbar({
  canCreate,
  busy,
  onCreate,
}: {
  canCreate: boolean;
  busy?: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="treatment-toolbar">
      <div>
        <h2>Planos e procedimentos</h2>
        <p>Selecione um tratamento para acompanhar ou editar.</p>
      </div>
      <div className="actions">
        {canCreate ? (
          <button type="button" className="button primary small" disabled={busy} onClick={onCreate}>
            <Plus size={14} /> Novo tratamento
          </button>
        ) : null}
      </div>
    </div>
  );
}

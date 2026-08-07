'use client';

import { Trash2 } from 'lucide-react';
import type { PrescriptionItem } from './document-types';

export type DraftPrescriptionItem = PrescriptionItem & { key: string };

export function blankPrescriptionItem(): DraftPrescriptionItem {
  return {
    key: crypto.randomUUID(),
    medicationName: '',
    quantity: '1',
    dosage: '',
    concentration: '',
    instructions: '',
    frequency: '',
    duration: '',
  };
}

export function PrescriptionItemEditor({
  items,
  onChange,
}: {
  items: DraftPrescriptionItem[];
  onChange: (next: DraftPrescriptionItem[]) => void;
}) {
  function update(key: string, patch: Partial<DraftPrescriptionItem>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  return (
    <div className="med-list">
      {items.map((item) => (
        <div className="med-row" key={item.key}>
          <label>
            Medicamento / item
            <input
              required
              value={item.medicationName}
              onChange={(event) => update(item.key, { medicationName: event.target.value })}
              placeholder="Digite o item"
            />
          </label>
          <label>
            Quantidade
            <input
              required
              value={item.quantity}
              onChange={(event) => update(item.key, { quantity: event.target.value })}
            />
          </label>
          <label>
            Posologia
            <input
              required
              value={item.dosage}
              onChange={(event) => update(item.key, { dosage: event.target.value })}
              placeholder="Ex.: 1 comprimido a cada 8h"
            />
          </label>
          <button
            type="button"
            className="button soft icon-only"
            aria-label="Remover item"
            onClick={() => onChange(items.filter((row) => row.key !== item.key))}
            disabled={items.length <= 1}
          >
            <Trash2 size={14} />
          </button>
          <label className="span-full">
            Instruções adicionais
            <input
              value={item.instructions ?? ''}
              onChange={(event) => update(item.key, { instructions: event.target.value })}
              placeholder="Opcional"
            />
          </label>
        </div>
      ))}
    </div>
  );
}

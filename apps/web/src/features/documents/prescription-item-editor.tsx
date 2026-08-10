'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { list, text, type RecordValue } from '@/lib/format';
import type { PrescriptionItem } from './document-types';

export type DraftPrescriptionItem = PrescriptionItem & {
  key: string;
  kind?: 'medication' | 'exam' | 'free_text';
};

type CatalogMedication = RecordValue & {
  id: string;
  name: string;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  defaultRoute?: string | null;
  activeIngredient?: string | null;
};

export function blankPrescriptionItem(
  kind: DraftPrescriptionItem['kind'] = 'medication',
): DraftPrescriptionItem {
  return {
    key: crypto.randomUUID(),
    kind,
    medicationName: kind === 'exam' ? '' : kind === 'free_text' ? 'Orientação' : '',
    quantity: kind === 'free_text' ? '—' : '1',
    dosage: kind === 'free_text' ? '' : '',
    concentration: '',
    instructions: '',
    frequency: '',
    duration: '',
    pharmaceuticalForm: '',
    route: '',
  };
}

function MedicationCatalogField({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (item: CatalogMedication) => void;
}) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<CatalogMedication[]>([]);
  const [open, setOpen] = useState(false);
  const [freeText, setFreeText] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (freeText) return;
    const handle = window.setTimeout(() => {
      api.get<CatalogMedication[]>(`/medication-catalog?q=${encodeURIComponent(query)}`)
        .then((data) => setOptions(list(data) as CatalogMedication[]))
        .catch(() => setOptions([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, freeText]);

  if (freeText) {
    return (
      <label className="span-full">
        Medicamento (texto livre)
        <input
          required
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Digite o medicamento"
        />
        <button type="button" className="button ghost small" style={{ marginTop: 6 }} onClick={() => setFreeText(false)}>
          Voltar à busca do catálogo
        </button>
      </label>
    );
  }

  return (
    <label className="span-full" style={{ position: 'relative' }}>
      Medicamento
      <input
        required
        autoFocus
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        placeholder="Buscar medicamento…"
        autoComplete="off"
      />
      {open ? (
        <div className="row-menu-popover" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, maxHeight: 220, overflow: 'auto' }}>
          {options.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              onClick={() => {
                onPick(item);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              {item.name}
              <small style={{ display: 'block', opacity: 0.7 }}>
                {[item.concentration, item.pharmaceuticalForm, item.defaultRoute].filter(Boolean).join(' · ')}
              </small>
            </button>
          ))}
          <button type="button" role="option" onClick={() => { setFreeText(true); setOpen(false); }}>
            + Usar texto livre
          </button>
        </div>
      ) : null}
    </label>
  );
}

export function PrescriptionItemEditor({
  items,
  onChange,
  focusKey,
}: {
  items: DraftPrescriptionItem[];
  onChange: (next: DraftPrescriptionItem[]) => void;
  focusKey?: string | null;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(focusKey ?? null);

  useEffect(() => {
    if (focusKey) setEditingKey(focusKey);
  }, [focusKey]);

  function update(key: string, patch: Partial<DraftPrescriptionItem>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function duplicate(item: DraftPrescriptionItem) {
    const copy = { ...item, key: crypto.randomUUID() };
    const index = items.findIndex((row) => row.key === item.key);
    const next = [...items];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setEditingKey(copy.key);
  }

  function move(key: string, direction: -1 | 1) {
    const index = items.findIndex((row) => row.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row!);
    onChange(next);
  }

  return (
    <div className="rx-composer-list">
      {items.map((item, index) => {
        const editing = editingKey === item.key;
        const title = item.medicationName.trim()
          || (item.kind === 'exam' ? 'Exame' : item.kind === 'free_text' ? 'Texto livre' : 'Medicamento');
        const summary = [item.concentration, item.quantity !== '—' ? item.quantity : '', item.dosage, item.frequency, item.duration]
          .filter(Boolean)
          .join(' · ');

        if (!editing) {
          return (
            <article className="rx-item-card" key={item.key}>
              <div>
                <strong>{index + 1}. {title}</strong>
                {summary ? <p>{summary}</p> : <p className="muted-note">Sem detalhes preenchidos</p>}
              </div>
              <div className="rx-item-card-actions">
                <button type="button" className="button ghost small" onClick={() => setEditingKey(item.key)}>
                  <Pencil size={13} /> Editar
                </button>
                <button type="button" className="button ghost small" onClick={() => duplicate(item)}>
                  <Copy size={13} /> Duplicar
                </button>
                <button type="button" className="button ghost small" onClick={() => move(item.key, -1)} disabled={index === 0}>
                  ↑
                </button>
                <button type="button" className="button ghost small" onClick={() => move(item.key, 1)} disabled={index === items.length - 1}>
                  ↓
                </button>
                <button
                  type="button"
                  className="button soft icon-only"
                  aria-label="Remover item"
                  onClick={() => {
                    onChange(items.filter((row) => row.key !== item.key));
                    if (editingKey === item.key) setEditingKey(null);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          );
        }

        return (
          <div className="med-row rx-item-editor" key={item.key}>
            <div className="span-full rx-item-editor-head">
              <strong>
                {item.kind === 'exam' ? 'Exame' : item.kind === 'free_text' ? 'Texto livre' : 'Medicamento'}
              </strong>
              <button type="button" className="button soft small" onClick={() => setEditingKey(null)}>
                Concluir item
              </button>
            </div>
            {item.kind === 'medication' ? (
              <MedicationCatalogField
                value={item.medicationName}
                onChange={(medicationName) => update(item.key, { medicationName })}
                onPick={(catalog) => update(item.key, {
                  medicationName: catalog.name,
                  concentration: text(catalog.concentration, item.concentration ?? ''),
                  pharmaceuticalForm: text(catalog.pharmaceuticalForm, item.pharmaceuticalForm ?? ''),
                  route: text(catalog.defaultRoute, item.route ?? ''),
                })}
              />
            ) : (
              <label className="span-full">
                {item.kind === 'exam' ? 'Exame' : 'Título'}
                <input
                  required
                  autoFocus
                  value={item.medicationName}
                  onChange={(event) => update(item.key, { medicationName: event.target.value })}
                  placeholder={item.kind === 'exam' ? 'Ex.: Radiografia panorâmica' : 'Orientação / recomendação'}
                />
              </label>
            )}
            {item.kind === 'medication' ? (
              <>
                <label>
                  Concentração
                  <input
                    value={item.concentration ?? ''}
                    onChange={(event) => update(item.key, { concentration: event.target.value })}
                    placeholder="Ex.: 500 mg"
                  />
                </label>
                <label>
                  Forma farmacêutica
                  <input
                    value={item.pharmaceuticalForm ?? ''}
                    onChange={(event) => update(item.key, { pharmaceuticalForm: event.target.value })}
                    placeholder="Comprimido, suspensão…"
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
                  Via
                  <input
                    value={item.route ?? ''}
                    onChange={(event) => update(item.key, { route: event.target.value })}
                    placeholder="Oral, tópica…"
                  />
                </label>
                <label>
                  Dose / posologia
                  <input
                    required
                    value={item.dosage}
                    onChange={(event) => update(item.key, { dosage: event.target.value })}
                    placeholder="Ex.: 1 comprimido"
                  />
                </label>
                <label>
                  Frequência
                  <input
                    value={item.frequency ?? ''}
                    onChange={(event) => update(item.key, { frequency: event.target.value })}
                    placeholder="A cada 8h"
                  />
                </label>
                <label>
                  Duração
                  <input
                    value={item.duration ?? ''}
                    onChange={(event) => update(item.key, { duration: event.target.value })}
                    placeholder="7 dias"
                  />
                </label>
              </>
            ) : null}
            <label className="span-full">
              {item.kind === 'free_text' ? 'Texto' : item.kind === 'exam' ? 'Indicação clínica' : 'Instruções / posologia completa'}
              <textarea
                rows={item.kind === 'free_text' ? 4 : 2}
                required={item.kind === 'free_text'}
                value={item.kind === 'free_text' ? (item.instructions || item.dosage) : (item.instructions ?? '')}
                onChange={(event) => {
                  if (item.kind === 'free_text') {
                    update(item.key, { instructions: event.target.value, dosage: event.target.value || '—' });
                  } else {
                    update(item.key, { instructions: event.target.value });
                  }
                }}
                placeholder={item.kind === 'exam' ? 'Indicação clínica' : 'Opcional'}
              />
            </label>
            {item.kind === 'exam' ? (
              <label>
                Quantidade / referência
                <input
                  required
                  value={item.quantity}
                  onChange={(event) => update(item.key, { quantity: event.target.value })}
                />
              </label>
            ) : null}
            {item.kind === 'exam' ? (
              <label>
                Resumo curto
                <input
                  required
                  value={item.dosage}
                  onChange={(event) => update(item.key, { dosage: event.target.value })}
                  placeholder="Ex.: 1 exame"
                />
              </label>
            ) : null}
            <div className="span-full rx-item-card-actions">
              <button
                type="button"
                className="button soft icon-only"
                aria-label="Remover item"
                onClick={() => {
                  onChange(items.filter((row) => row.key !== item.key));
                  setEditingKey(null);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

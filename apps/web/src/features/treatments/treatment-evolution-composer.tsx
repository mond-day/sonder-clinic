'use client';

import { FormEvent, useState } from 'react';
import type { Professional } from '@/components/selection-provider';
import { evolutionSchema } from './treatment-schemas';
import type { TreatmentItem } from './treatment-types';

/** Composer de evolução clínica vinculada — sem áudio/transcrição. */
export function TreatmentEvolutionComposer({
  professionals,
  items,
  busy,
  error,
  onSubmit,
}: {
  professionals: Professional[];
  items: TreatmentItem[];
  busy: boolean;
  error: string;
  onSubmit: (input: { professionalId: string; renderedText: string; treatmentItemId?: string }) => Promise<void>;
}) {
  const [formError, setFormError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);
    const itemId = String(data.get('treatmentItemId') ?? '').trim();
    const parsed = evolutionSchema.safeParse({
      professionalId: data.get('professionalId'),
      renderedText: data.get('renderedText'),
      treatmentItemId: itemId || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    await onSubmit(parsed.data);
    event.currentTarget.reset();
  }

  return (
    <form className="mutation-form compact" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Procedimento vinculado
        <select name="treatmentItemId" defaultValue="">
          <option value="">Plano geral</option>
          {items.filter((item) => String(item.status) !== 'CANCELLED').map((item) => (
            <option key={item.id} value={item.id}>{item.procedure?.name ?? 'Procedimento'}</option>
          ))}
        </select>
      </label>
      <label>
        Profissional
        <select name="professionalId" required defaultValue={professionals[0]?.id ?? ''}>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>{professional.name}</option>
          ))}
        </select>
      </label>
      <label className="span-2">
        Evolução clínica
        <textarea name="renderedText" required minLength={2} rows={4} placeholder="Descreva o procedimento realizado, materiais, orientações e intercorrências." />
      </label>
      {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
      <div className="form-actions span-2">
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Registrar evolução'}</button>
      </div>
    </form>
  );
}

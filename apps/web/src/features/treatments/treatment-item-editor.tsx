'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { treatmentItemDraftSchema } from './treatment-schemas';
import type { DraftItemInput, Procedure, TreatmentItem } from './treatment-types';

export function TreatmentItemEditor({
  open,
  mode,
  item,
  procedures,
  professionals,
  defaultProfessionalId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  item?: TreatmentItem | null;
  procedures: Procedure[];
  professionals: Professional[];
  defaultProfessionalId?: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: Omit<DraftItemInput, 'key'>) => Promise<void>;
}) {
  const [formError, setFormError] = useState('');
  const [procedureId, setProcedureId] = useState(item?.procedureId ?? '');

  const selectedProcedure = useMemo(
    () => procedures.find((row) => row.id === procedureId),
    [procedures, procedureId],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);
    const parsed = treatmentItemDraftSchema.safeParse({
      procedureId: data.get('procedureId'),
      professionalId: data.get('professionalId'),
      toothFdi: String(data.get('toothFdi') ?? '').trim() || undefined,
      face: String(data.get('face') ?? '').trim() || undefined,
      quantity: data.get('quantity'),
      unitPrice: data.get('unitPrice'),
      discount: String(data.get('discount') ?? '0') || '0',
      plannedSessions: data.get('plannedSessions'),
      urgent: data.get('urgent') === 'on',
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (selectedProcedure?.requiresTooth && !parsed.data.toothFdi) {
      setFormError('Este procedimento exige dente/região.');
      return;
    }
    if (selectedProcedure?.requiresFace && !parsed.data.face) {
      setFormError('Este procedimento exige face.');
      return;
    }
    await onSubmit({
      procedureId: parsed.data.procedureId,
      professionalId: parsed.data.professionalId,
      toothFdi: parsed.data.toothFdi ?? '',
      face: parsed.data.face ?? '',
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      discount: parsed.data.discount ?? '0',
      plannedSessions: parsed.data.plannedSessions,
      urgent: parsed.data.urgent ?? false,
    });
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? 'Adicionar procedimento' : 'Editar procedimento'}
      description="Valores finais são recalculados no servidor."
      onClose={onClose}
      size="large"
    >
      <form
        className="mutation-form"
        onSubmit={(event) => void handleSubmit(event)}
        key={item?.id ?? 'new-item'}
      >
        <label className="span-2">
          Procedimento
          <select
            name="procedureId"
            required
            defaultValue={item?.procedureId ?? ''}
            onChange={(event) => setProcedureId(event.target.value)}
          >
            <option value="">Selecione</option>
            {procedures.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>{procedure.name}</option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select name="professionalId" required defaultValue={item?.professionalId ?? defaultProfessionalId ?? ''}>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
        </label>
        <label>
          Quantidade
          <input name="quantity" type="number" min={1} defaultValue={item?.quantity ?? 1} required />
        </label>
        <label>
          Dente / região
          <input name="toothFdi" defaultValue={item?.toothFdi ?? ''} placeholder={selectedProcedure?.requiresTooth ? 'Obrigatório' : 'Opcional'} />
        </label>
        <label>
          Face
          <input name="face" defaultValue={item?.face ?? ''} placeholder={selectedProcedure?.requiresFace ? 'Obrigatório' : 'Opcional'} />
        </label>
        <label>
          Valor unitário
          <input name="unitPrice" inputMode="decimal" required defaultValue={String(item?.unitPrice ?? '0')} />
        </label>
        <label>
          Desconto
          <input name="discount" inputMode="decimal" defaultValue={String(item?.discount ?? '0')} />
        </label>
        <label>
          Sessões planejadas
          <input
            name="plannedSessions"
            type="number"
            min={1}
            defaultValue={item?.plannedSessions ?? selectedProcedure?.defaultSessions ?? 1}
            required
          />
        </label>
        <label className="check-field">
          <input type="checkbox" name="urgent" defaultChecked={Boolean(item?.urgent)} />
          Urgente
        </label>
        {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

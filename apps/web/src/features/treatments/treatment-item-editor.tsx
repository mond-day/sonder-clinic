'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { formatMoneyInputFromValue, moneyInputToApi } from '@/lib/format';
import { FaceSelect, MoneyField, ProcedureSearchSelect, ToothSelect } from './treatment-field-inputs';
import { treatmentItemDraftSchema } from './treatment-schemas';
import type { DraftItemInput, Procedure, TreatmentItem } from './treatment-types';

export function TreatmentItemEditor({
  open,
  mode,
  item,
  procedures,
  defaultProfessionalId,
  busy,
  error,
  onClose,
  onSubmit,
  variant = 'modal',
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
  variant?: 'modal' | 'drawer';
}) {
  const [formError, setFormError] = useState('');
  const [procedureId, setProcedureId] = useState(item?.procedureId ?? '');
  const [toothFdi, setToothFdi] = useState(item?.toothFdi ?? '');
  const [face, setFace] = useState(item?.face ?? '');
  const [unitPrice, setUnitPrice] = useState(formatMoneyInputFromValue(item?.unitPrice ?? '0'));
  const [discount, setDiscount] = useState(formatMoneyInputFromValue(item?.discount ?? '0'));
  const [plannedSessions, setPlannedSessions] = useState(item?.plannedSessions ?? 1);

  useEffect(() => {
    if (!open) return;
    setProcedureId(item?.procedureId ?? '');
    setToothFdi(item?.toothFdi ?? '');
    setFace(item?.face ?? '');
    setUnitPrice(formatMoneyInputFromValue(item?.unitPrice ?? '0'));
    setDiscount(formatMoneyInputFromValue(item?.discount ?? '0'));
    setPlannedSessions(item?.plannedSessions ?? 1);
    setFormError('');
  }, [item, open]);

  const selectedProcedure = useMemo(
    () => procedures.find((row) => row.id === procedureId),
    [procedures, procedureId],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);
    const parsed = treatmentItemDraftSchema.safeParse({
      procedureId,
      professionalId: defaultProfessionalId || undefined,
      toothFdi: toothFdi.trim() || undefined,
      face: face.trim() || undefined,
      quantity: data.get('quantity'),
      unitPrice: moneyInputToApi(unitPrice),
      discount: moneyInputToApi(discount || '0'),
      plannedSessions,
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

  if (!open) return null;

  const form = (
    <form
      className="mutation-form"
      onSubmit={(event) => void handleSubmit(event)}
      key={item?.id ?? 'new-item'}
    >
      <div className="span-2">
        <ProcedureSearchSelect
          name="procedureId"
          value={procedureId}
          procedures={procedures}
          onChange={(nextId) => {
            setProcedureId(nextId);
            const nextProcedure = procedures.find((row) => row.id === nextId);
            if (nextProcedure?.defaultSessions) setPlannedSessions(nextProcedure.defaultSessions);
          }}
        />
      </div>
      <label>
        Quantidade
        <input name="quantity" type="number" min={1} defaultValue={item?.quantity ?? 1} required />
      </label>
      <ToothSelect
        name="toothFdi"
        value={toothFdi}
        required={Boolean(selectedProcedure?.requiresTooth)}
        onChange={setToothFdi}
      />
      <FaceSelect
        name="face"
        value={face}
        required={Boolean(selectedProcedure?.requiresFace)}
        onChange={setFace}
      />
      <MoneyField name="unitPrice" label="Valor unitário" required value={unitPrice} onChange={setUnitPrice} />
      <MoneyField name="discount" label="Desconto" value={discount} onChange={setDiscount} />
      <label>
        Sessões planejadas
        <input
          name="plannedSessions"
          type="number"
          min={1}
          value={plannedSessions}
          onChange={(event) => setPlannedSessions(Number(event.target.value) || 1)}
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
  );

  if (variant === 'drawer') {
    return (
      <aside className="treatment-procedure-drawer" aria-label={mode === 'create' ? 'Adicionar procedimento' : 'Editar procedimento'}>
        <header className="treatment-procedure-drawer-head">
          <div>
            <h3>{mode === 'create' ? 'Adicionar procedimento' : 'Editar procedimento'}</h3>
            <p>O profissional responsável fica no plano. Na execução, use o profissional da sessão ou da conclusão.</p>
          </div>
          <button type="button" className="button ghost small" onClick={onClose}>Fechar</button>
        </header>
        {form}
      </aside>
    );
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? 'Adicionar procedimento' : 'Editar procedimento'}
      description="Os valores finais são calculados automaticamente ao salvar."
      onClose={onClose}
      size="large"
      confirmOnClose
    >
      {form}
    </Modal>
  );
}

'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { createTreatmentSchema, updateTreatmentSchema } from './treatment-schemas';
import type { DraftItemInput, Procedure, TreatmentPlan } from './treatment-types';

function blankItem(professionalId: string): DraftItemInput {
  return {
    key: crypto.randomUUID(),
    procedureId: '',
    professionalId,
    toothFdi: '',
    face: '',
    quantity: 1,
    unitPrice: '0',
    discount: '0',
    plannedSessions: 1,
    urgent: false,
  };
}

export function TreatmentPlanEditor({
  open,
  mode,
  plan,
  procedures,
  professionals,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  plan?: TreatmentPlan | null;
  procedures: Procedure[];
  professionals: Professional[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    professionalId: string;
    discount: string;
    notes?: string;
    validUntil?: string;
    items: Array<{
      procedureId: string;
      professionalId: string;
      toothFdi?: string;
      face?: string;
      quantity: number;
      unitPrice: string;
      discount?: string;
      plannedSessions?: number;
      urgent?: boolean;
    }>;
  }) => Promise<void>;
  onUpdate: (input: {
    title?: string;
    notes?: string;
    discount?: string;
    validUntil?: string | null;
    version?: number;
  }) => Promise<void>;
}) {
  const defaultProfessionalId = plan?.professionalId ?? professionals[0]?.id ?? '';
  const [formError, setFormError] = useState('');
  const [items, setItems] = useState<DraftItemInput[]>([blankItem(defaultProfessionalId)]);

  const procedureMap = useMemo(
    () => new Map(procedures.map((row) => [row.id, row])),
    [procedures],
  );

  function resetCreateItems() {
    setItems([blankItem(defaultProfessionalId)]);
    setFormError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);

    if (mode === 'edit' && plan) {
      const parsed = updateTreatmentSchema.safeParse({
        title: String(data.get('title') ?? '').trim(),
        notes: String(data.get('notes') ?? '').trim() || undefined,
        discount: String(data.get('discount') ?? plan.discount),
        validUntil: String(data.get('validUntil') ?? '') || null,
        version: plan.version,
      });
      if (!parsed.success) {
        setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
        return;
      }
      await onUpdate(parsed.data);
      return;
    }

    const parsed = createTreatmentSchema.safeParse({
      title: data.get('title'),
      professionalId: data.get('professionalId'),
      discount: String(data.get('discount') ?? '0') || '0',
      notes: String(data.get('notes') ?? '').trim() || undefined,
      validUntil: String(data.get('validUntil') ?? '') || undefined,
      items: items.map((item) => ({
        procedureId: item.procedureId,
        professionalId: item.professionalId,
        toothFdi: item.toothFdi.trim() || undefined,
        face: item.face.trim() || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || '0',
        plannedSessions: item.plannedSessions,
        urgent: item.urgent,
      })),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    for (const item of parsed.data.items) {
      const procedure = procedureMap.get(item.procedureId);
      if (procedure?.requiresTooth && !item.toothFdi) {
        setFormError(`Procedimento ${procedure.name} exige dente/região.`);
        return;
      }
      if (procedure?.requiresFace && !item.face) {
        setFormError(`Procedimento ${procedure.name} exige face.`);
        return;
      }
    }
    await onCreate(parsed.data);
    resetCreateItems();
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? 'Novo tratamento' : 'Editar tratamento'}
      description="Cadastre o plano, os procedimentos e o responsável clínico."
      onClose={() => {
        onClose();
        if (mode === 'create') resetCreateItems();
      }}
      size="large"
    >
      <form
        className="mutation-form"
        onSubmit={(event) => void handleSubmit(event)}
        key={mode === 'edit' ? plan?.id ?? 'edit' : 'create'}
      >
        <label>
          Nome do tratamento
          <input name="title" required minLength={3} defaultValue={plan?.title ?? ''} placeholder="Ex.: Reabilitação estética anterior" />
        </label>
        <label>
          Profissional responsável
          <select name="professionalId" required defaultValue={defaultProfessionalId} disabled={mode === 'edit'}>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
        </label>
        <label>
          Validade
          <input name="validUntil" type="date" defaultValue={plan?.validUntil ? String(plan.validUntil).slice(0, 10) : ''} />
        </label>
        <label>
          Desconto do plano
          <input name="discount" inputMode="decimal" defaultValue={String(plan?.discount ?? '0')} />
        </label>
        <label className="span-2">
          Observações
          <textarea name="notes" rows={3} defaultValue={plan?.notes ?? ''} placeholder="Objetivo clínico, restrições, sequência sugerida…" />
        </label>

        {mode === 'create' ? (
          <div className="span-2 procedure-editor-block">
            <div className="procedure-editor-head">
              <div>
                <strong>Procedimentos</strong>
                <p>Inclua dente, face, quantidade, valor e sessões previstas.</p>
              </div>
              <button
                type="button"
                className="button soft small"
                onClick={() => setItems((current) => [...current, blankItem(defaultProfessionalId)])}
              >
                <Plus size={14} /> Procedimento
              </button>
            </div>
            <div className="repeat-list">
              {items.map((item, index) => {
                const procedure = procedureMap.get(item.procedureId);
                return (
                  <div className="procedure-edit" key={item.key}>
                    <label>
                      Procedimento
                      <select
                        value={item.procedureId}
                        required
                        onChange={(event) => {
                          const nextId = event.target.value;
                          const nextProcedure = procedureMap.get(nextId);
                          setItems((current) => current.map((row, rowIndex) => (
                            rowIndex === index
                              ? {
                                  ...row,
                                  procedureId: nextId,
                                  plannedSessions: nextProcedure?.defaultSessions ?? row.plannedSessions,
                                }
                              : row
                          )));
                        }}
                      >
                        <option value="">Selecione</option>
                        {procedures.map((procedureOption) => (
                          <option key={procedureOption.id} value={procedureOption.id}>{procedureOption.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Profissional
                      <select
                        value={item.professionalId}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, professionalId: event.target.value } : row
                        )))}
                      >
                        {professionals.map((professional) => (
                          <option key={professional.id} value={professional.id}>{professional.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Dente
                      <input
                        value={item.toothFdi}
                        placeholder={procedure?.requiresTooth ? 'Obrigatório' : '—'}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, toothFdi: event.target.value } : row
                        )))}
                      />
                    </label>
                    <label>
                      Face
                      <input
                        value={item.face}
                        placeholder={procedure?.requiresFace ? 'Obrigatório' : '—'}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, face: event.target.value } : row
                        )))}
                      />
                    </label>
                    <label>
                      Qtd
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, quantity: Number(event.target.value) || 1 } : row
                        )))}
                      />
                    </label>
                    <label>
                      Valor
                      <input
                        value={item.unitPrice}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, unitPrice: event.target.value } : row
                        )))}
                      />
                    </label>
                    <label>
                      Sessões
                      <input
                        type="number"
                        min={1}
                        value={item.plannedSessions}
                        onChange={(event) => setItems((current) => current.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, plannedSessions: Number(event.target.value) || 1 } : row
                        )))}
                      />
                    </label>
                      <button
                      type="button"
                      className="button danger small"
                      aria-label="Remover procedimento"
                      disabled={items.length <= 1}
                      onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Salvando…' : mode === 'create' ? 'Salvar tratamento' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

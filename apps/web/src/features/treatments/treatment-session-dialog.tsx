'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { sessionSchema } from './treatment-schemas';
import type { TreatmentItem } from './treatment-types';

export function TreatmentSessionDialog({
  open,
  item,
  professionals,
  busy,
  error,
  onClose,
  onSubmit,
  variant = 'modal',
}: {
  open: boolean;
  item: TreatmentItem | null;
  professionals: Professional[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: {
    professionalId: string;
    executionNotes: string;
    complications?: string;
    allowExtraSession?: boolean;
  }) => Promise<void>;
  variant?: 'modal' | 'drawer';
}) {
  const [formError, setFormError] = useState('');
  const doneSessions = (item?.sessions ?? []).filter((session) => !session.correctionOfId).length;
  const planned = Number(item?.plannedSessions ?? 1);
  const needsExtra = doneSessions >= planned;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const data = new FormData(event.currentTarget);
    const parsed = sessionSchema.safeParse({
      professionalId: data.get('professionalId'),
      executionNotes: data.get('executionNotes'),
      complications: String(data.get('complications') ?? '').trim() || undefined,
      allowExtraSession: needsExtra || data.get('allowExtraSession') === 'on',
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    await onSubmit(parsed.data);
  }

  if (!open) return null;

  const form = (
    <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)} key={item?.id ?? 'session'}>
      <label>
        Profissional
        <select name="professionalId" required defaultValue={item?.professionalId ?? professionals[0]?.id ?? ''}>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>{professional.name}</option>
          ))}
        </select>
      </label>
      <label className="span-2">
        Notas de execução
        <textarea name="executionNotes" required minLength={2} rows={4} placeholder="Descreva o que foi realizado nesta sessão." />
      </label>
      <label className="span-2">
        Intercorrências
        <textarea name="complications" rows={2} placeholder="Opcional" />
      </label>
      {needsExtra ? (
        <label className="check-field span-2">
          <input type="checkbox" name="allowExtraSession" defaultChecked />
          Permitir sessão adicional além do planejado
        </label>
      ) : null}
      {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
      <div className="form-actions span-2">
        <button type="button" className="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar sessão'}</button>
      </div>
    </form>
  );

  if (variant === 'drawer') {
    return (
      <aside className="treatment-procedure-drawer" aria-label="Registrar sessão">
        <header className="treatment-procedure-drawer-head">
          <div>
            <h3>Registrar sessão</h3>
            <p>{item ? `${item.procedure?.name ?? 'Procedimento'} · ${doneSessions}/${planned} sessões` : 'Sessão'}</p>
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
      title="Registrar sessão"
      description={item ? `${item.procedure?.name ?? 'Procedimento'} · ${doneSessions}/${planned} sessões` : undefined}
      onClose={onClose}
      size="medium"
    >
      {form}
    </Modal>
  );
}

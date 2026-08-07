'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { shareSchema } from './document-schemas';

export function SignaturePanel({
  open,
  busy,
  error,
  defaultSignerName,
  shareLink,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  defaultSignerName: string;
  shareLink: string;
  onClose: () => void;
  onSubmit: (input: { signerRole: string; signerName: string; expiresInHours: number }) => Promise<void>;
}) {
  const [signerRole, setSignerRole] = useState('PATIENT');
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSignerName(defaultSignerName);
    setSignerRole('PATIENT');
    setExpiresInHours(72);
    setFormError('');
  }, [open, defaultSignerName]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = shareSchema.safeParse({ signerRole, signerName, expiresInHours });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    setFormError('');
    await onSubmit(parsed.data);
  }

  return (
    <Modal
      open={open}
      title="Solicitar assinatura remota"
      description="Gera token de uso único com expiração. O link público não expõe conteúdo clínico."
      onClose={onClose}
      size="medium"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Papel do signatário
          <select value={signerRole} onChange={(event) => setSignerRole(event.target.value)}>
            <option value="PATIENT">Paciente</option>
            <option value="GUARDIAN">Responsável</option>
            <option value="PROFESSIONAL">Profissional</option>
          </select>
        </label>
        <label>
          Nome
          <input required value={signerName} onChange={(event) => setSignerName(event.target.value)} />
        </label>
        <label>
          Expira em (horas)
          <input
            type="number"
            min={1}
            max={168}
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(Number(event.target.value))}
          />
        </label>
        {shareLink ? (
          <label className="span-2">
            Link gerado
            <input readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} />
          </label>
        ) : null}
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Fechar</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Gerando…' : 'Gerar link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

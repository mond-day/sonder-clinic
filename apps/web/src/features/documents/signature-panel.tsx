'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import { isLocalhostAppUrl } from '@/lib/public-url';
import { shareSchema } from './document-schemas';

const EXPIRY_PRESETS = [
  { label: '24 horas', hours: 24 },
  { label: '3 dias', hours: 72 },
  { label: '7 dias', hours: 168 },
] as const;

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
  const [customExpiry, setCustomExpiry] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSignerName(defaultSignerName);
    setSignerRole('PATIENT');
    setExpiresInHours(72);
    setCustomExpiry(false);
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

  const showLocalhostWarning = Boolean(shareLink) && isLocalhostAppUrl(shareLink);

  return (
    <Modal
      open={open}
      title="Solicitar assinatura remota"
      description="Crie um link seguro para o paciente, responsável ou profissional assinar este documento."
      onClose={onClose}
      size="medium"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Quem vai assinar?
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
        <label className="span-2">
          Validade do link
          <select
            value={customExpiry ? 'custom' : String(expiresInHours)}
            onChange={(event) => {
              if (event.target.value === 'custom') {
                setCustomExpiry(true);
                return;
              }
              setCustomExpiry(false);
              setExpiresInHours(Number(event.target.value));
            }}
          >
            {EXPIRY_PRESETS.map((preset) => (
              <option key={preset.hours} value={preset.hours}>{preset.label}</option>
            ))}
            <option value="custom">Personalizar (horas)</option>
          </select>
        </label>
        {customExpiry ? (
          <label>
            Horas
            <input
              type="number"
              min={1}
              max={168}
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(Number(event.target.value))}
            />
          </label>
        ) : null}
        {shareLink ? (
          <label className="span-2">
            Link gerado
            <input readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} />
          </label>
        ) : null}
        {showLocalhostWarning ? (
          <p className="secure-notice span-2" role="status">
            Este link funciona somente neste computador. Para testar a assinatura em outro dispositivo, configure um endereço acessível na rede ou um túnel HTTPS.
          </p>
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

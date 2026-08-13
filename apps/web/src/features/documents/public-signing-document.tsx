'use client';

import { useState } from 'react';
import { SignaturePad } from '@/features/anamnesis/signature-pad';

export function PublicSigningDocument({
  clinicName,
  title,
  patientName,
  signerName,
  signerRole,
  expiresAt,
  renderedText,
  consentText,
  error,
  busy,
  onSign,
}: {
  clinicName: string;
  title: string;
  patientName?: string | null;
  signerName: string;
  signerRole?: string;
  expiresAt?: string;
  renderedText: string;
  consentText: string;
  error?: string | null;
  busy: boolean;
  onSign: (input: { dataUrl: string; consentAccepted: true }) => Promise<void>;
}) {
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [localError, setLocalError] = useState('');

  async function confirm() {
    if (!accepted) {
      setLocalError('Confirme que revisou o documento e concorda com a assinatura eletrônica.');
      return;
    }
    if (!signature) {
      setLocalError('Desenhe a assinatura para continuar.');
      return;
    }
    setLocalError('');
    await onSign({ dataUrl: signature, consentAccepted: true });
  }

  return (
    <main className="legal-page public-signing">
      <p className="eyebrow">{clinicName}</p>
      <h1>{title}</h1>
      <p>
        {patientName ? <>Paciente: <strong>{patientName}</strong> · </> : null}
        Signatário: {signerName}
        {signerRole === 'GUARDIAN' ? ' (responsável)' : signerRole === 'PATIENT' ? ' (paciente)' : ''}
      </p>
      {expiresAt ? (
        <p className="muted-note">Link válido até {new Date(expiresAt).toLocaleString('pt-BR')}</p>
      ) : null}

      <section className="panel public-signing-document">
        <h2>Documento</h2>
        <p className="muted-note">Leia o conteúdo completo antes de assinar. A assinatura vale para este texto.</p>
        <article className="public-signing-body">{renderedText || 'Conteúdo indisponível.'}</article>
      </section>

      <section className="panel">
        <h2>Assinatura eletrônica</h2>
        <label className="check-field">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>{consentText}</span>
        </label>
        <SignaturePad onChange={setSignature} />
        {(localError || error) ? <p className="form-error" role="alert">{localError || error}</p> : null}
        <div className="heading-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="button primary"
            disabled={busy || !signature || !accepted}
            onClick={() => void confirm()}
          >
            {busy ? 'Registrando…' : 'Confirmar assinatura eletrônica'}
          </button>
        </div>
      </section>
    </main>
  );
}

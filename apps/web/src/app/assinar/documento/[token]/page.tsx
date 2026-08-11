'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignaturePad } from '@/features/anamnesis/signature-pad';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type PublicPayload = {
  requestId?: string;
  signerName?: string;
  signerRole?: string;
  expiresAt?: string;
  document?: {
    id?: string;
    status?: string;
    templateName?: string;
    templateType?: string;
    clinicName?: string | null;
    patientName?: string | null;
  };
};

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload?.message[0] : payload?.message;
  if (response.status === 410) return message ?? 'Link revogado, expirado ou já utilizado.';
  if (response.status === 404) return message ?? 'Link de assinatura inválido.';
  return message ?? 'Não foi possível carregar a assinatura.';
}

export default function PublicDocumentSignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/public/document-signatures/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<PublicPayload>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  async function sign() {
    if (!signature) {
      setError('Desenhe a assinatura para continuar.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/public/document-signatures/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence: { dataUrl: signature } }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao assinar.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="legal-page">
        <h1>Assinatura indisponível</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="legal-page"><p>Carregando…</p></main>;
  }

  if (done) {
    return (
      <main className="legal-page">
        <h1>Assinatura registrada</h1>
        <p>Obrigado. O documento foi assinado com sucesso. Você já pode fechar esta página.</p>
      </main>
    );
  }

  const clinicName = data.document?.clinicName ?? 'Clínica';

  return (
    <main className="legal-page public-anamnesis">
      <p className="eyebrow">{clinicName}</p>
      <h1>Assinar documento</h1>
      <p>
        {data.document?.patientName ? <>Paciente: <strong>{data.document.patientName}</strong> · </> : null}
        {data.document?.templateName}
        {data.document?.templateType ? ` · ${data.document.templateType}` : ''}
        {' · '}
        Signatário: {data.signerName}
        {data.signerRole ? ` (${data.signerRole})` : ''}
      </p>
      {data.expiresAt ? (
        <p className="muted-note">Link válido até {new Date(data.expiresAt).toLocaleString('pt-BR')}</p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section className="panel">
        <h2>Assinatura</h2>
        <p className="muted-note">Desenhe abaixo para concluir a assinatura do documento pendente.</p>
        <SignaturePad onChange={setSignature} />
        <div className="heading-actions" style={{ marginTop: 16 }}>
          <button type="button" className="button primary" disabled={busy || !signature} onClick={() => void sign()}>
            {busy ? 'Registrando…' : 'Confirmar assinatura'}
          </button>
        </div>
      </section>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PublicSigningDocument } from '@/features/documents/public-signing-document';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type PublicPayload = {
  requestId?: string;
  signerName?: string;
  signerRole?: string;
  expiresAt?: string;
  consent?: { version?: string; text?: string };
  document?: {
    id?: string;
    status?: string;
    templateName?: string;
    templateType?: string;
    clinicName?: string | null;
    patientName?: string | null;
    renderedText?: string;
    contentHash?: string;
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

  async function sign(input: { dataUrl: string; consentAccepted: true }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/public/document-signatures/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence: {
            dataUrl: input.dataUrl,
            consentAccepted: true,
            documentHash: data?.document?.contentHash,
          },
        }),
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
        <h1>Assinatura eletrônica registrada</h1>
        <p>Obrigado. O documento foi assinado com sucesso. Você já pode fechar esta página.</p>
      </main>
    );
  }

  return (
    <PublicSigningDocument
      clinicName={data.document?.clinicName ?? 'Clínica'}
      title={data.document?.templateName ?? 'Assinar documento'}
      patientName={data.document?.patientName}
      signerName={data.signerName ?? 'Signatário'}
      signerRole={data.signerRole}
      expiresAt={data.expiresAt}
      renderedText={data.document?.renderedText ?? ''}
      consentText={data.consent?.text ?? 'Declaro que revisei o conteúdo deste documento e concordo com a utilização desta assinatura eletrônica para manifestação da minha vontade.'}
      error={error}
      busy={busy}
      onSign={sign}
    />
  );
}

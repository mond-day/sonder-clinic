'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignaturePad } from '@/features/anamnesis/signature-pad';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function PublicAnamnesisSignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<{
    clinic?: { tradeName?: string; legalName?: string };
    signerName?: string;
    template?: { name?: string; version?: number };
    answers?: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/public/anamnesis-signatures/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Link inválido ou expirado.');
        return response.json();
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
      const response = await fetch(`${API_URL}/public/anamnesis-signatures/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidence: { dataUrl: signature } }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Falha ao assinar.');
      }
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
        <p>Obrigado. Você já pode fechar esta página.</p>
      </main>
    );
  }

  return (
    <main className="legal-page">
      <p className="eyebrow">{data.clinic?.tradeName ?? data.clinic?.legalName ?? 'Sonder Clinic'}</p>
      <h1>Assinar anamnese</h1>
      <p>
        {data.template?.name} · v{data.template?.version} — {data.signerName}
      </p>
      <section className="panel">
        <h2>Resumo das respostas</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {JSON.stringify(data.answers ?? {}, null, 2)}
        </pre>
      </section>
      <section className="panel">
        <h2>Assinatura</h2>
        <SignaturePad onChange={setSignature} />
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <button type="button" className="button primary" disabled={busy} onClick={() => void sign()}>
          Confirmar assinatura
        </button>
      </section>
    </main>
  );
}

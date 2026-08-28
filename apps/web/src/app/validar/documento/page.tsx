'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getApiUrl } from '@/lib/api';

type ValidationResult = {
  authentic?: boolean;
  status?: string;
  contentHash?: string;
  generatedAt?: string;
  type?: string;
  templateType?: string;
  clinicName?: string | null;
  signatures?: Array<{
    signerName?: string;
    signerLabel?: string;
    role?: string;
    method?: string;
    signedAt?: string;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  GENERATED: 'Gerado',
  SIGNED: 'Assinado',
  PARTIALLY_SIGNED: 'Parcialmente assinado',
  CANCELLED: 'Cancelado',
  SUPERSEDED: 'Substituído',
};

export default function ValidateDocumentPage() {
  return (
    <Suspense fallback={<main className="legal-page"><p>Carregando…</p></main>}>
      <ValidateDocumentPageInner />
    </Suspense>
  );
}

function ValidateDocumentPageInner() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoValidatedFor = useRef<string | null>(null);

  async function validateToken(token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Informe o código de validação impresso no PDF.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${getApiUrl()}/public/documents/${encodeURIComponent(trimmed)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Documento não encontrado ou código inválido.');
      }
      setResult(await response.json() as ValidationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na validação.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const prefill = searchParams.get('codigo') ?? searchParams.get('code');
    if (!prefill) return;
    setCode(prefill);
    if (autoValidatedFor.current === prefill) return;
    autoValidatedFor.current = prefill;
    void validateToken(prefill);
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await validateToken(code);
  }

  return (
    <main className="legal-page">
      <p className="eyebrow">Sonder Clinic</p>
      <h1>Validar documento assinado</h1>
      <p>
        Informe o código de autenticidade impresso no PDF (ou lido pelo QR) para conferir se o documento
        é genuíno e quais assinaturas foram registradas.
      </p>
      <form className="mutation-form" onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <label className="span-2">
          Código de validação
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Cole o código do PDF"
            autoFocus
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Validando…' : 'Validar autenticidade'}
        </button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {result ? (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2>{result.authentic === false ? 'Documento não autenticado' : 'Documento autenticado'}</h2>
          <p><strong>Clínica:</strong> {result.clinicName ?? '—'}</p>
          <p><strong>Tipo:</strong> {result.type ?? result.templateType ?? '—'}</p>
          <p><strong>Status:</strong> {STATUS_LABELS[String(result.status)] ?? result.status ?? '—'}</p>
          <p><strong>Gerado em:</strong> {result.generatedAt ? new Date(result.generatedAt).toLocaleString('pt-BR') : '—'}</p>
          <p><strong>Hash do conteúdo:</strong> <code>{result.contentHash ?? '—'}</code></p>
          <h3>Assinaturas</h3>
          {(result.signatures ?? []).length === 0 ? (
            <p className="muted-note">Nenhuma assinatura registrada neste documento.</p>
          ) : (
            <ul>
              {(result.signatures ?? []).map((item, index) => (
                <li key={`${item.signerLabel ?? item.signerName}-${index}`}>
                  {item.signerLabel ?? item.signerName ?? 'Signatário'}
                  {item.role ? ` · ${item.role}` : ''}
                  {item.method ? ` · ${item.method}` : ''}
                  {item.signedAt ? ` · ${new Date(item.signedAt).toLocaleString('pt-BR')}` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <nav className="legal-links" style={{ marginTop: 24 }}>
        <Link href="/legal/privacidade">Política Sonder</Link>
        <Link href="/">Voltar</Link>
      </nav>
    </main>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignaturePad } from '@/features/anamnesis/signature-pad';
import { QuestionRenderer } from '@/features/anamnesis/question-renderer';
import { isGroupVisible, type ConditionGroup } from '@/features/anamnesis/conditions';
import { getApiUrl } from '@/lib/api';

type PublicPayload = {
  clinic?: { tradeName?: string; legalName?: string };
  patient?: { fullName?: string };
  signerName?: string;
  signerRole?: string;
  expiresAt?: string;
  template?: {
    name?: string;
    audience?: string;
    version?: number;
    schemaJson?: {
      sections?: Array<{
        id: string;
        title: string;
        order: number;
        visibleWhen?: ConditionGroup;
        questions: Array<{
          id: string;
          code: string;
          label: string;
          type: string;
          required: boolean;
          options?: Array<{ value: string; label: string }>;
          helpText?: string;
          visibleWhen?: ConditionGroup;
        }>;
      }>;
    };
  };
  answers?: Record<string, unknown>;
  signatures?: Array<{ signerRole: string; signerName: string; signedAt: string }>;
};

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload?.message[0] : payload?.message;
  if (response.status === 410) return message ?? 'Link revogado, expirado ou já utilizado.';
  if (response.status === 404) return message ?? 'Link de assinatura inválido.';
  return message ?? 'Não foi possível carregar a assinatura.';
}

export default function PublicAnamnesisSignPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${getApiUrl()}/public/anamnesis-signatures/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<PublicPayload>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const sections = useMemo(() => {
    const answers = data?.answers ?? {};
    return (data?.template?.schemaJson?.sections ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .filter((section) => isGroupVisible(answers, section.visibleWhen));
  }, [data]);

  async function sign() {
    if (!signature) {
      setError('Desenhe a assinatura para continuar.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/public/anamnesis-signatures/${token}/sign`, {
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
        <p>Obrigado. Você já pode fechar esta página.</p>
      </main>
    );
  }

  const clinicName = data.clinic?.tradeName ?? data.clinic?.legalName ?? 'Sonder Clinic';
  const answers = data.answers ?? {};

  return (
    <main className="legal-page public-anamnesis">
      <p className="eyebrow">{clinicName}</p>
      <h1>Assinar anamnese</h1>
      <p>
        Paciente: <strong>{data.patient?.fullName ?? '—'}</strong>
        {' · '}
        {data.template?.name} · v{data.template?.version}
        {' · '}
        Signatário: {data.signerName}
      </p>
      {data.expiresAt ? (
        <p className="muted-note">Link válido até {new Date(data.expiresAt).toLocaleString('pt-BR')}</p>
      ) : null}

      <section className="panel">
        <h2>Conteúdo clínico (somente leitura)</h2>
        {sections.map((section) => {
          const questions = section.questions.filter((question) => isGroupVisible(answers, question.visibleWhen));
          return (
            <div key={section.id} className="public-anamnesis-section">
              <h3>{section.title}</h3>
              {questions.map((question) => (
                <QuestionRenderer
                  key={question.id}
                  question={question}
                  value={answers[question.code]}
                  onChange={() => undefined}
                  readOnly
                />
              ))}
            </div>
          );
        })}
        {!sections.length ? (
          <p className="muted-note">Não há perguntas estruturadas para exibir neste formulário.</p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Assinatura</h2>
        <p>Data/hora: {new Date().toLocaleString('pt-BR')}</p>
        <SignaturePad onChange={setSignature} />
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <button type="button" className="button primary" disabled={busy} onClick={() => void sign()}>
          Confirmar assinatura
        </button>
      </section>
    </main>
  );
}

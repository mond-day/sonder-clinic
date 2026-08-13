'use client';

import { useMemo, useState } from 'react';
import { EmptyState, StatusBadge } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { dateTime, presentationLabel, text } from '@/lib/format';
import { isLocalhostAppUrl, publicAppUrl } from '@/lib/public-url';
import * as documentApi from '@/features/documents/document-api';
import type { GeneratedDocument } from '@/features/documents/document-types';
import { SignaturePanel } from '@/features/documents/signature-panel';
import type { TreatmentPlan } from './treatment-types';
import * as treatmentApi from './treatment-api';

function contractStatusLabel(doc?: GeneratedDocument | null) {
  if (!doc) return 'Não gerado';
  const roles = new Set((doc.signatures ?? []).map((row) => row.role));
  const hasPatient = roles.has('PATIENT') || roles.has('GUARDIAN');
  const hasProvider = roles.has('CLINIC') || roles.has('PROFESSIONAL');
  if (doc.status === 'SIGNED') return 'Assinado';
  if (doc.status === 'CANCELLED') return 'Cancelado';
  if (hasPatient && !hasProvider) return 'Aguardando prestador';
  if (!hasPatient) return 'Aguardando paciente';
  return presentationLabel(doc.status);
}

export function TreatmentDocumentsPanel({
  plan,
  patientName,
  clinicName,
  canApprove,
  canSign,
  busy,
  documents,
  onChanged,
}: {
  plan: TreatmentPlan;
  patientName: string;
  clinicName: string;
  canApprove: boolean;
  canSign: boolean;
  busy: boolean;
  documents: GeneratedDocument[];
  onChanged: () => Promise<void> | void;
}) {
  const contract = useMemo(
    () => documents.find((doc) => String(doc.template?.type).toUpperCase() === 'CONTRACT' && doc.status !== 'CANCELLED') ?? null,
    [documents],
  );
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [localBusy, setLocalBusy] = useState(false);

  const working = busy || localBusy;
  const approved = String(plan.status) === 'APPROVED'
    || String(plan.status) === 'IN_PROGRESS'
    || String(plan.status) === 'COMPLETED';

  async function run(action: () => Promise<void>, success?: string) {
    setLocalBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      if (success) setError('');
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.');
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="treatment-documents">
      <article className="treatment-document-card">
        <header>
          <h3>Contrato de prestação de serviços</h3>
          <StatusBadge tone={contract?.status === 'SIGNED' ? 'green' : contract ? 'amber' : 'gray'}>
            {contractStatusLabel(contract)}
          </StatusBadge>
        </header>
        <p>
          {String(plan.status) === 'PARTIALLY_APPROVED'
            ? 'A aprovação parcial não gera contrato. Aprove o restante do plano para emitir o documento.'
            : contract
              ? `Gerado na versão ${contract.frozenContent && typeof (contract.frozenContent as { treatmentSnapshot?: { version?: number } }).treatmentSnapshot?.version === 'number'
                ? String((contract.frozenContent as { treatmentSnapshot?: { version?: number } }).treatmentSnapshot?.version)
                : plan.version} do plano. Forma de pagamento: ${text((contract.frozenContent as { payment?: { summary?: string } } | undefined)?.payment?.summary, 'registrada na aprovação')}.`
              : approved
                ? 'O plano está aprovado. Gere o contrato para enviar ao paciente.'
                : 'O contrato é gerado automaticamente quando o plano é aprovado por completo.'}
        </p>
        {contract ? (
          <ul className="treatment-document-meta">
            {(contract.signatures ?? []).map((signature, index) => (
              <li key={signature.id ?? `${signature.role}-${index}`}>
                {presentationLabel(signature.role)} · {text(signature.signerName)} · {presentationLabel(signature.method)}
                {signature.signedAt ? ` · ${dateTime(signature.signedAt)}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="heading-actions">
          {!contract && approved && canApprove ? (
            <button
              type="button"
              className="button primary small"
              disabled={working}
              onClick={() => void run(() => treatmentApi.ensureTreatmentContract(plan.id).then(() => undefined))}
            >
              Gerar contrato
            </button>
          ) : null}
          {contract ? (
            <>
              <button
                type="button"
                className="button ghost small"
                disabled={working}
                onClick={() => void run(() => documentApi.downloadDocumentPdf(contract.id, contract.template?.name ?? 'contrato'))}
              >
                Baixar
              </button>
              {contract.validationCode ? (
                <a
                  className="button ghost small"
                  href={`/validar/documento?codigo=${encodeURIComponent(contract.validationCode)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Validar
                </a>
              ) : null}
              {canSign && !['SIGNED', 'CANCELLED'].includes(contract.status) ? (
                <button
                  type="button"
                  className="button soft small"
                  disabled={working}
                  onClick={() => {
                    setShareLink('');
                    setShareOpen(true);
                  }}
                >
                  Enviar para assinatura
                </button>
              ) : null}
              {canSign && contract.status !== 'SIGNED' && (contract.signatures ?? []).some((row) => row.role === 'PATIENT' || row.role === 'GUARDIAN') ? (
                <button
                  type="button"
                  className="button primary small"
                  disabled={working}
                  onClick={() => void run(async () => {
                    await documentApi.signDocument(contract.id, {
                      signerName: clinicName,
                      role: 'CLINIC',
                      method: 'A1',
                      evidence: { source: 'treatment-contract' },
                    });
                  })}
                >
                  Assinar com certificado digital
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <p className="muted-note">
          O arquivo também fica na biblioteca do paciente, pasta Contratos.
          A clínica assina com o certificado digital configurado; a verificação PAdES no VALIDAR do ITI entra na próxima etapa.
        </p>
      </article>

      {!documents.length && !approved ? (
        <EmptyState title="Sem documentos vinculados" description="Aprove o plano por completo para gerar o contrato." />
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <SignaturePanel
        open={shareOpen}
        busy={working}
        error={error}
        defaultSignerName={patientName}
        shareLink={shareLink}
        onClose={() => setShareOpen(false)}
        onSubmit={async (input) => {
          if (!contract) return;
          await run(async () => {
            const result = await documentApi.createSignatureRequest(contract.id, input);
            const absolute = publicAppUrl(result.publicPath);
            setShareLink(absolute);
            await navigator.clipboard?.writeText(absolute).catch(() => undefined);
          });
        }}
      />
      {shareLink && isLocalhostAppUrl(shareLink) ? (
        <p className="secure-notice" role="status">
          Este link funciona somente neste computador, salvo se a clínica tiver um endereço público configurado.
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, ErrorState, Panel, Skeleton, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

type Detail = RecordValue & {
  id: string;
  status: string;
  effectiveStatus?: string;
  answers?: Record<string, unknown>;
  alerts?: Array<{ severity?: string; message?: string }>;
  riskAssessment?: { score?: number; level?: string };
  validUntil?: string | null;
  signedAt?: string | null;
  contentHash?: string | null;
  template?: { name?: string; audience?: string; version?: number; schemaJson?: unknown };
  signatures?: Array<{
    id: string;
    signerName: string;
    signerRole: string;
    signedAt: string;
    signedHash: string;
    method: string;
  }>;
  signatureRequests?: Array<{
    id: string;
    signerName: string;
    signerRole: string;
    createdAt: string;
    expiresAt: string;
    usedAt?: string | null;
    revokedAt?: string | null;
  }>;
  clinic?: { tradeName?: string; legalName?: string };
  patient?: { fullName?: string };
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function displayStatus(row: { status: string; effectiveStatus?: string }) {
  return presentationLabel(row.effectiveStatus ?? row.status);
}

export function AnamnesisDetailModal({
  responseId,
  clinicId,
  open,
  onClose,
  onContinueDraft,
  onChanged,
}: {
  responseId: string | null;
  clinicId: string;
  open: boolean;
  onClose: () => void;
  onContinueDraft: (id: string) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remoteLink, setRemoteLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!responseId || !open) return;
    setLoading(true);
    setError(null);
    setRemoteLink(null);
    try {
      const data = await api.get<Detail>(`/anamnesis/${responseId}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar anamnese.');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [responseId, open]);

  useEffect(() => { void load(); }, [load]);

  async function revoke(requestId: string) {
    if (!detail) return;
    setBusy(true);
    try {
      await api.post(`/anamnesis/${detail.id}/signature-requests/${requestId}/revoke`);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao revogar solicitação.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!detail) return;
    setBusy(true);
    try {
      await api.post(`/anamnesis/${detail.id}/reopen-draft`);
      onChanged();
      onContinueDraft(detail.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível reabrir.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!detail || !window.confirm('Excluir este rascunho permanentemente?')) return;
    setBusy(true);
    try {
      await api.delete(`/anamnesis/${detail.id}/draft`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function createUpdate() {
    if (!detail) return;
    setBusy(true);
    try {
      const draft = await api.post<{ id: string }>(`/anamnesis/${detail.id}/supersede`, { clinicId });
      onChanged();
      onContinueDraft(draft.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar atualização.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelResponse() {
    if (!detail || !window.confirm('Cancelar esta anamnese? Assinaturas históricas serão preservadas.')) return;
    setBusy(true);
    try {
      await api.post(`/anamnesis/${detail.id}/cancel`, { reason: 'Cancelada pela equipe' });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cancelar.');
    } finally {
      setBusy(false);
    }
  }

  async function requestLink() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await api.post<{ publicPath: string }>(`/anamnesis/${detail.id}/request-signature`, {
        signerRole: 'PATIENT',
        signerName: text(detail.patient?.fullName) || 'Paciente',
      });
      const absolute = `${window.location.origin}${result.publicPath}`;
      setRemoteLink(absolute);
      await navigator.clipboard?.writeText(absolute).catch(() => undefined);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao gerar link.');
    } finally {
      setBusy(false);
    }
  }

  const status = detail?.effectiveStatus ?? detail?.status;
  const wasSigned = Boolean(detail?.signedAt) || (detail?.signatures?.length ?? 0) > 0;
  const activeRequests = (detail?.signatureRequests ?? []).filter((r) => !r.revokedAt && !r.usedAt);

  return (
    <Modal
      open={open}
      size="xlarge"
      title={text(detail?.template?.name) || 'Anamnese'}
      description="Detalhe clínico, assinaturas e ações por status."
      onClose={onClose}
    >
      {loading ? <Skeleton rows={5} /> : null}
      {error ? <ErrorState description={error} /> : null}
      {!loading && detail ? (
        <div className="anamnesis-detail">
          <div className="summary-strip compact">
            <div><span>Status</span><strong>{displayStatus(detail)}</strong></div>
            <div><span>Versão</span><strong>v{text(detail.template?.version) || '—'}</strong></div>
            <div><span>Risco</span><strong>{presentationLabel(detail.riskAssessment?.level ?? '—')}</strong></div>
            <div><span>Validade</span><strong>{formatDate(detail.validUntil)}</strong></div>
            {wasSigned ? <div><span>Assinatura</span><strong>Foi assinada</strong></div> : null}
          </div>

          <Panel title="Assinaturas">
            {(detail.signatures ?? []).length ? (
              <ul className="settings-list">
                {detail.signatures!.map((signature) => (
                  <li key={signature.id} className="settings-row">
                    <div>
                      <strong>{presentationLabel(signature.signerRole)} — {signature.signerName}</strong>
                      <span>{formatDate(signature.signedAt)} · {presentationLabel(signature.method)}</span>
                    </div>
                    <StatusBadge tone="green">Assinado</StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sem assinaturas" description="Ainda não há signatários neste registro." />
            )}
          </Panel>

          <Panel title="Solicitações ativas">
            {activeRequests.length ? (
              <ul className="settings-list">
                {activeRequests.map((request) => (
                  <li key={request.id} className="settings-row">
                    <div>
                      <strong>{presentationLabel(request.signerRole)} — {request.signerName}</strong>
                      <span>Gerado em {formatDate(request.createdAt)} · Expira {formatDate(request.expiresAt)}</span>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="button small" disabled={busy} onClick={() => void revoke(request.id)}>
                        Revogar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-note">Nenhuma solicitação ativa.</p>
            )}
            {remoteLink ? <p className="muted-note">Link copiado: {remoteLink}</p> : null}
          </Panel>

          <Panel title="Alertas">
            {list(detail.alerts as unknown as RecordValue[]).length ? (
              <div className="clinical-timeline">
                {(detail.alerts ?? []).map((alert, index) => (
                  <article key={`${alert.message}-${index}`} className="clinical-timeline-item">
                    <StatusBadge tone={alert.severity === 'CRITICAL' ? 'red' : alert.severity === 'WARNING' ? 'amber' : 'blue'}>
                      {presentationLabel(alert.severity ?? 'INFO')}
                    </StatusBadge>
                    <p>{alert.message}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-note">Sem alertas.</p>
            )}
          </Panel>

          <div className="heading-actions sticky-actions">
            {status === 'DRAFT' ? (
              <>
                <button type="button" className="button primary" disabled={busy} onClick={() => { onContinueDraft(detail.id); onClose(); }}>
                  Continuar preenchimento
                </button>
                <button type="button" className="button" disabled={busy} onClick={() => void deleteDraft()}>
                  Excluir rascunho
                </button>
              </>
            ) : null}
            {status === 'AWAITING_SIGNATURE' ? (
              <>
                <button type="button" className="button soft" disabled={busy} onClick={() => void requestLink()}>
                  Gerar/copiar link
                </button>
                <button type="button" className="button" disabled={busy} onClick={() => void reopen()}>
                  Reabrir para edição
                </button>
                <button type="button" className="button" disabled={busy} onClick={() => void cancelResponse()}>
                  Cancelar
                </button>
              </>
            ) : null}
            {status === 'SIGNED' || status === 'EXPIRED' ? (
              <>
                <button type="button" className="button primary" disabled={busy} onClick={() => void createUpdate()}>
                  Criar atualização
                </button>
                {status === 'SIGNED' ? (
                  <button type="button" className="button" disabled={busy} onClick={() => void cancelResponse()}>
                    Cancelar (preservar assinatura)
                  </button>
                ) : null}
              </>
            ) : null}
            {status === 'CANCELLED' && wasSigned ? (
              <StatusBadge tone="amber">Cancelada — foi assinada (histórico preservado)</StatusBadge>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

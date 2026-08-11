'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FilePenLine, Pencil, PenLine, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateTime, list, nested, presentationLabel, statusTone, text, type RecordValue } from '@/lib/format';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/ui';

type Mode = 'view' | 'edit' | 'correct';

export function ClinicalEntryDetailModal({
  open,
  entryId,
  professionals,
  onClose,
  onChanged,
}: {
  open: boolean;
  entryId: string | null;
  professionals: Array<{ id: string; name: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [entry, setEntry] = useState<RecordValue | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [draftText, setDraftText] = useState('');
  const [correctionText, setCorrectionText] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !entryId) {
      setEntry(null);
      setMode('view');
      setConfirmDelete(false);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    api
      .get<RecordValue>(`/clinical-entries/${entryId}`)
      .then((data) => {
        setEntry(data);
        setDraftText(text(data.renderedText));
        setMode('view');
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar evolução.'))
      .finally(() => setBusy(false));
  }, [open, entryId]);

  const status = String(entry?.status ?? '');
  const isDraft = status === 'DRAFT';
  const isSigned = status === 'SIGNED' || status === 'CORRECTED';
  const professionalName = professionals.find((p) => p.id === entry?.professionalId)?.name
    ?? text(nested(entry ?? {}, 'professional').name, '—');

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!entryId || !isDraft) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.patch<RecordValue>(`/clinical-entries/${entryId}/draft`, {
        renderedText: draftText.trim(),
      });
      setEntry(updated);
      setMode('view');
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function signDraft() {
    if (!entryId || !isDraft) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.post<RecordValue>(`/clinical-entries/${entryId}/sign`, {});
      setEntry(updated);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao assinar.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft() {
    if (!entryId || !isDraft) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/clinical-entries/${entryId}`);
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao excluir rascunho.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function submitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!entryId || !isSigned) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/clinical-entries/${entryId}/corrections`, {
        reason: correctionReason.trim(),
        renderedText: correctionText.trim(),
        correctedContent: { renderedText: correctionText.trim() },
        kind: 'ADDENDUM',
      });
      const updated = await api.get<RecordValue>(`/clinical-entries/${entryId}`);
      setEntry(updated);
      setMode('view');
      setCorrectionReason('');
      setCorrectionText('');
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao adicionar correção.');
    } finally {
      setBusy(false);
    }
  }

  const corrections = list(entry?.corrections);

  return (
    <Modal
      open={open && Boolean(entryId)}
      title="Detalhe da evolução"
      description="Leitura integral e ações conforme o status do registro."
      onClose={onClose}
      size="large"
      closeOnBackdrop={false}
    >
      {!entry && busy ? <p className="muted-note">Carregando…</p> : null}
      {entry ? (
        <div className="clinical-entry-detail">
          <div className="summary-strip compact">
            <div><small>Tipo</small><strong>{presentationLabel(entry.type)}</strong></div>
            <div>
              <small>Status</small>
              <StatusBadge tone={statusTone(entry.status)}>{presentationLabel(entry.status)}</StatusBadge>
            </div>
            <div><small>Profissional</small><strong>{professionalName}</strong></div>
            <div><small>Data clínica</small><strong>{dateTime(entry.clinicalDate)}</strong></div>
          </div>

          <div className="duplicate-meta" style={{ marginBottom: 12 }}>
            {entry.treatmentId ? <span>Tratamento vinculado</span> : null}
            {entry.appointmentId ? <span>Consulta vinculada</span> : null}
            {entry.toothFdi ? <span>Dente {text(entry.toothFdi)}</span> : null}
            {entry.signedAt ? <span>Assinado em {dateTime(entry.signedAt)}</span> : null}
          </div>

          {mode === 'view' ? (
            <div className="clinical-entry-body">
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text(entry.renderedText)}</p>
            </div>
          ) : null}

          {mode === 'edit' && isDraft ? (
            <form className="mutation-form" onSubmit={saveDraft}>
              <label className="span-2">Conteúdo
                <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} required minLength={2} rows={8} />
              </label>
              <div className="heading-actions span-2">
                <button type="button" className="button soft" onClick={() => setMode('view')}>Cancelar</button>
                <button type="submit" className="button primary" disabled={busy}>Salvar rascunho</button>
              </div>
            </form>
          ) : null}

          {mode === 'correct' && isSigned ? (
            <form className="mutation-form" onSubmit={submitCorrection}>
              <label className="span-2">Motivo
                <input value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} required minLength={3} />
              </label>
              <label className="span-2">Correção / adendo
                <textarea value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} required minLength={2} rows={5} />
              </label>
              <div className="heading-actions span-2">
                <button type="button" className="button soft" onClick={() => setMode('view')}>Cancelar</button>
                <button type="submit" className="button primary" disabled={busy}>Salvar adendo</button>
              </div>
            </form>
          ) : null}

          {corrections.length > 0 ? (
            <div className="clinical-timeline" style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px' }}>Correções / adendos</h4>
              {corrections.map((item) => (
                <div className="clinical-timeline-item" key={String(item.id)}>
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{presentationLabel(item.kind)}</strong>
                    <span>{text(item.reason)} · {text(item.renderedText, '—')}</span>
                  </div>
                  <div className="timeline-date">{dateTime(item.createdAt)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {status === 'CANCELLED' ? (
            <p className="muted-note">Registro cancelado. Motivo disponível nos adendos quando aplicável.</p>
          ) : null}

          <div className="heading-actions" style={{ marginTop: 16 }}>
            {isDraft && mode === 'view' ? (
              <>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  title="Editar"
                  aria-label="Editar rascunho"
                  onClick={() => setMode('edit')}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  title="Assinar"
                  aria-label="Assinar evolução"
                  onClick={() => void signDraft()}
                >
                  <PenLine size={16} />
                </button>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    title="Excluir rascunho"
                    aria-label="Excluir rascunho"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <>
                    <button type="button" className="button danger" disabled={busy} onClick={() => void deleteDraft()}>
                      Confirmar exclusão
                    </button>
                    <button type="button" className="button soft" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                  </>
                )}
              </>
            ) : null}
            {isSigned && mode === 'view' ? (
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                title="Adicionar correção / adendo"
                aria-label="Adicionar correção ou adendo"
                onClick={() => setMode('correct')}
              >
                <FilePenLine size={16} />
              </button>
            ) : null}
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </Modal>
  );
}

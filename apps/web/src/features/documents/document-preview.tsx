'use client';

import { dateOnly, dateTime, presentationLabel, statusTone, text } from '@/lib/format';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui';
import type {
  DocumentEvent,
  GeneratedDocument,
  LibraryItem,
  PatientMedia,
  Prescription,
  PrescriptionItem,
} from './document-types';

function asItems(raw: unknown): PrescriptionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is PrescriptionItem => Boolean(row) && typeof row === 'object');
}

function bodyFromFrozen(content?: Record<string, unknown> | null): string {
  if (!content) return 'Conteúdo clínico congelado na geração.';
  const parts = [
    text(content.corpo, ''),
    text(content.prescricao, ''),
    text(content.observacoes, ''),
    content.daysAway != null ? `Afastamento: ${String(content.daysAway)} dia(s).` : '',
    content.startTime && content.endTime
      ? `Comparecimento: ${String(content.startTime)} às ${String(content.endTime)}.`
      : '',
    content.cid ? `CID: ${String(content.cid)}.` : '',
  ].filter(Boolean);
  return parts.join('\n\n') || 'Conteúdo clínico congelado na geração.';
}

export function DocumentPreview({
  selectedMeta,
  document,
  prescription,
  media,
  history,
  loading,
  busy,
  patientName,
  patientCpfMasked,
  professionalName,
  canSign,
  canArchive,
  canCancel,
  actionError,
  onSign,
  onShare,
  onDownload,
  onRename,
  onArchive,
  onCancel,
}: {
  selectedMeta: LibraryItem | null;
  document: GeneratedDocument | null;
  prescription: Prescription | null;
  media: PatientMedia | null;
  history: DocumentEvent[];
  loading: boolean;
  busy: boolean;
  patientName: string;
  patientCpfMasked: string;
  professionalName: (id?: string | null) => string;
  canSign: boolean;
  canArchive: boolean;
  canCancel: boolean;
  actionError: string;
  onSign: (method: 'DRAWN' | 'A1') => void;
  onShare: () => void;
  onDownload: () => void;
  onRename: () => void;
  onArchive: () => void;
  onCancel: () => void;
}) {
  if (!selectedMeta) {
    return (
      <div className="document-preview-empty">
        <EmptyState
          title="Selecione um documento ou arquivo"
          description="A prévia e as ações aparecerão aqui."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="document-preview-panel">
        <Skeleton rows={8} />
      </div>
    );
  }

  const status = selectedMeta.status;
  const toolbar = (
    <div className="preview-toolbar">
      <StatusBadge tone={statusTone(status)}>{presentationLabel(status)}</StatusBadge>
      <span className="muted-meta">
        {text(selectedMeta.folderName, 'Biblioteca')} · {dateOnly(selectedMeta.date)}
      </span>
      <div className="right">
        {selectedMeta.source === 'upload' ? (
          <button type="button" className="button ghost small" disabled={busy} onClick={onRename}>
            ✎ Renomear
          </button>
        ) : null}
        {selectedMeta.source === 'generated' && canSign ? (
          <button type="button" className="button ghost small" disabled={busy} onClick={onShare}>
            ↗ Assinatura remota
          </button>
        ) : null}
        <button type="button" className="button ghost small" disabled={busy} onClick={onDownload}>
          ↓ Baixar
        </button>
        {selectedMeta.source === 'generated' && canSign && !['SIGNED', 'CANCELLED'].includes(status) ? (
          <>
            <button type="button" className="button soft small" disabled={busy} onClick={() => onSign('DRAWN')}>
              Assinar
            </button>
            <button type="button" className="button primary small" disabled={busy} onClick={() => onSign('A1')}>
              Assinar A1
            </button>
          </>
        ) : null}
        {selectedMeta.source === 'prescription' && canSign && status !== 'SIGNED' && status !== 'CANCELLED' ? (
          <button type="button" className="button primary small" disabled={busy} onClick={() => onSign('A1')}>
            Assinar RX
          </button>
        ) : null}
        {canArchive ? (
          <button type="button" className="button danger small" disabled={busy} onClick={onArchive}>
            {selectedMeta.source === 'upload' ? 'Arquivar' : 'Arquivar'}
          </button>
        ) : null}
        {selectedMeta.source !== 'upload' && canCancel && !['SIGNED', 'CANCELLED'].includes(status) ? (
          <button type="button" className="button ghost small" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );

  if (selectedMeta.source === 'upload' && media) {
    const file = media.file;
    return (
      <div className="document-preview-panel">
        {toolbar}
        {actionError ? <p className="form-error detail-error" role="alert">{actionError}</p> : null}
        <div className="preview-wrap">
          <div className="file-preview">
            <div className="big-icon">{typeLabel(media.type)}</div>
            <h2>{text(media.displayName, file?.originalName)}</h2>
            <p>{text(media.notes, 'Arquivo armazenado no prontuário do paciente.')}</p>
            <p>
              <strong>Tipo:</strong> {presentationLabel(media.type)}
              {' · '}
              <strong>Tamanho:</strong> {formatBytes(file?.sizeBytes)}
              {' · '}
              <strong>AV:</strong> {presentationLabel(file?.antivirusStatus)}
              {' · '}
              <strong>Enviado:</strong> {dateOnly(media.createdAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedMeta.source === 'prescription' && prescription) {
    const items = asItems(prescription.items);
    const identity = (prescription.frozenIdentity ?? {}) as Record<string, unknown>;
    return (
      <div className="document-preview-panel">
        {toolbar}
        {actionError ? <p className="form-error detail-error" role="alert">{actionError}</p> : null}
        <div className="preview-wrap">
          <article className="paper clinical-paper">
            <header className="paper-letterhead">
              <div>
                <strong>{text(identity.clinicName, 'SONDER CLINIC')}</strong>
                <span>Receituário odontológico</span>
              </div>
              <div className="paper-meta">
                <span>RX</span>
                <span>Cód. {text(prescription.validationCode, '—')}</span>
              </div>
            </header>
            <h2>RECEITUÁRIO ODONTOLÓGICO</h2>
            <section className="paper-identity">
              <p><strong>Paciente:</strong> {text(identity.patientName, patientName)}</p>
              <p><strong>CPF:</strong> {text(identity.patientCpfMasked, patientCpfMasked)}</p>
              <p><strong>Profissional:</strong> {text(identity.professionalName, professionalName(prescription.professionalId))}</p>
              <p><strong>CRO:</strong> {text(identity.professionalCro, '—')}</p>
              <p><strong>Data:</strong> {dateOnly(prescription.createdAt)}</p>
              <p><strong>Finalidade:</strong> {text(prescription.purpose)}</p>
            </section>
            <section className="paper-body">
              {items.map((item, index) => (
                <div className="rx-item" key={`${item.medicationName}-${index}`}>
                  <strong>
                    {index + 1}. {item.medicationName}
                    {item.concentration ? ` ${item.concentration}` : ''}
                    {item.quantity ? ` — ${item.quantity}` : ''}
                  </strong>
                  <span>
                    {[item.dosage, item.frequency, item.duration, item.instructions]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </section>
            <div className="paper-signatures">
              <div>
                <span>{prescription.status === 'SIGNED' ? 'Assinado digitalmente' : 'Assinatura do profissional'}</span>
                <small>{text(identity.professionalName, professionalName(prescription.professionalId))}</small>
              </div>
              <div>
                <span>Assinatura do paciente</span>
                <small>{text(identity.patientName, patientName)}</small>
              </div>
            </div>
          </article>
        </div>
        {history.length ? <DocumentHistoryInline events={history} /> : null}
      </div>
    );
  }

  if (selectedMeta.source === 'generated' && document) {
    const frozen = document.frozenContent ?? {};
    const identity = frozen.identity ?? {};
    const title = text(document.template?.name, selectedMeta.name).toUpperCase();
    return (
      <div className="document-preview-panel">
        {toolbar}
        {actionError ? <p className="form-error detail-error" role="alert">{actionError}</p> : null}
        <div className="preview-wrap">
          <article className="paper clinical-paper">
            <header className="paper-letterhead">
              <div>
                <strong>{text(identity.clinicName, 'SONDER CLINIC')}</strong>
                <span>Documento odontológico</span>
              </div>
              <div className="paper-meta">
                <span>{presentationLabel(document.template?.type)}</span>
                <span>Cód. {text(document.validationCode)}</span>
              </div>
            </header>
            <h2>{title}</h2>
            <section className="paper-identity">
              <p><strong>Paciente:</strong> {text(identity.patientName, patientName)}</p>
              <p><strong>CPF:</strong> {text(identity.patientCpfMasked, patientCpfMasked)}</p>
              <p><strong>Profissional:</strong> {text(identity.professionalName, professionalName(document.professionalId))}</p>
              <p><strong>CRO:</strong> {text(identity.professionalCro, '—')}</p>
              <p><strong>Data:</strong> {dateOnly(identity.generatedAt ?? document.generatedAt)}</p>
              <p><strong>Versão do modelo:</strong> v{document.templateVersion}</p>
            </section>
            <section className="paper-body">
              <p style={{ whiteSpace: 'pre-wrap' }}>{bodyFromFrozen(frozen)}</p>
            </section>
            <div className="paper-signatures">
              <div>
                <span>{document.status === 'SIGNED' ? 'Assinado digitalmente' : 'Assinatura do profissional'}</span>
                <small>{text(identity.professionalName, professionalName(document.professionalId))}</small>
              </div>
              <div>
                <span>Assinatura do paciente</span>
                <small>{text(identity.patientName, patientName)}</small>
              </div>
            </div>
            {(document.signatures?.length ?? 0) > 0 ? (
              <ul className="signature-list">
                {document.signatures?.map((signature, index) => (
                  <li key={signature.id ?? `${signature.role}-${index}`}>
                    {presentationLabel(signature.role)} · {text(signature.signerName)} · {presentationLabel(signature.method)}
                    {signature.signedAt ? ` · ${dateTime(signature.signedAt)}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        </div>
        {history.length ? <DocumentHistoryInline events={history} /> : null}
      </div>
    );
  }

  return (
    <div className="document-preview-empty">
      <EmptyState title="Não foi possível carregar a prévia" description="Tente selecionar o item novamente." />
    </div>
  );
}

function DocumentHistoryInline({ events }: { events: DocumentEvent[] }) {
  return (
    <div className="document-history">
      <h3>Histórico</h3>
      <div className="timeline">
        {events.slice(0, 8).map((event) => (
          <div className="timeline-item" key={event.id}>
            <span className="dot" />
            <div>
              <strong>{presentationLabel(event.type)}</strong>
              <time>{dateTime(event.createdAt)}</time>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function typeLabel(type: string) {
  const value = type.toUpperCase();
  if (value.includes('PHOTO') || value.includes('IMAGE')) return 'IMG';
  if (value.includes('VIDEO')) return 'VID';
  if (value.includes('RADIO')) return 'RX';
  if (value.includes('PDF')) return 'PDF';
  return 'FILE';
}

function formatBytes(size?: number) {
  if (!size || size <= 0) return '—';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

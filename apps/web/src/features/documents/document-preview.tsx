'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Archive, Ban, Download, Pencil, Printer, Share2, Stamp } from 'lucide-react';
import { api, API_URL } from '@/lib/api';

const PROFESSIONAL_ECPF_REQUIRED_MESSAGE =
  'Vincule o e-CPF deste profissional em Configurações → Certificados';
import { dateOnly, dateTime, formatCro, presentationLabel, statusTone, text } from '@/lib/format';
import { printHtmlDocument } from '@/lib/print-document';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui';
import { useClinicBranding } from '@/components/clinic-brand';
import { useSelection } from '@/components/selection-provider';
import { formatDentalCidLine } from './dental-cid';
import {
  formatLegalCpf,
  formatLegalPlaceLine,
  LegalDocumentPaper,
  type LegalIdentityView,
  type LegalSignatureView,
} from './legal/legal-document-paper';
import type {
  DocumentEvent,
  GeneratedDocument,
  LibraryItem,
  PatientMedia,
  Prescription,
  PrescriptionItem,
} from './document-types';

const LEGAL_PRINT_CSS = `
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#fff;color:#1d292e}
.legal-document-paper{color-scheme:light;--legal-accent:#176B5B;width:210mm;min-height:297mm;background:#fffefb;color:#1d292e;padding:16mm 16mm 28mm;position:relative;font-family:Arial,Helvetica,sans-serif;box-shadow:none;background-image:radial-gradient(circle at 0 0,color-mix(in srgb,var(--legal-accent) 7%,transparent),transparent 46%)}
.legal-letterhead{display:flex;justify-content:space-between;gap:24px;padding-bottom:12px;border-bottom:2.5px solid var(--legal-accent)}
.legal-clinic strong{display:block;font-size:15px;margin-bottom:4px;color:var(--legal-accent)}
.legal-clinic span,.legal-professional span{display:block;font-size:9.5px;line-height:1.5;color:#3b494e}
.legal-professional{text-align:right;min-width:190px}
.legal-professional strong{display:block;font-size:11px;margin-bottom:3px}
.legal-title{text-align:center;margin:24px 0 20px}
.legal-title small{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:var(--legal-accent);margin-bottom:5px}
.legal-title h1{margin:0;font-family:Georgia,serif;font-size:21px}
.legal-identity{display:grid;grid-template-columns:1fr 1fr;gap:7px 20px;border:1px solid #e4e0d5;background:#f7f7f3;border-radius:7px;padding:11px 12px;font-size:10px}
.legal-identity p{margin:0}
.legal-body{margin-top:22px;font-family:Georgia,serif;font-size:12.5px;line-height:1.75}
.legal-item{padding:0 0 16px;margin:0 0 17px;border-bottom:1px dashed #ded9cf}
.legal-item strong{display:block;margin-bottom:6px}
.legal-details{padding-left:16px;font-family:Arial,sans-serif;font-size:10px;color:#3b494e}
.legal-signature-stack{margin-top:34px;display:grid;gap:24px}
.legal-signature{max-width:430px;border-top:1px solid #cbc5b9;padding-top:9px}
.legal-signature-label{font-size:8.5px;text-transform:uppercase;letter-spacing:.09em;color:#7b827f;font-weight:700}
.legal-signature strong{display:block;font-size:10.5px;margin-top:3px}
.legal-signature span{display:block;font-size:9px;color:#657176}
.legal-seal{margin-bottom:8px;display:flex;gap:8px;padding:7px 8px;background:#eef6f3;border:1px solid #d4e6df;border-radius:6px}
.legal-footer{position:absolute;left:16mm;right:16mm;bottom:11mm;min-height:22mm;padding-top:8px;border-top:1px solid #d9d5ca;display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
.legal-validation{max-width:128mm;font-size:8px;color:#657176}
.legal-qr{width:18mm;height:18mm;border:1px solid #d9d5ca;display:grid;place-items:center;font-size:8px;overflow:hidden;background:#fff}
.legal-qr img{width:100%;height:100%;object-fit:contain}
img,video,iframe{max-width:100%}
`;

function identityFromRecord(raw: Record<string, unknown>, fallbacks: LegalIdentityView = {}): LegalIdentityView {
  return {
    clinicName: text(raw.clinicName, fallbacks.clinicName ?? ''),
    clinicLegalName: text(raw.clinicLegalName, fallbacks.clinicLegalName ?? ''),
    clinicTaxId: text(raw.clinicTaxId, ''),
    clinicPhone: text(raw.clinicPhone, ''),
    clinicEmail: text(raw.clinicEmail, ''),
    clinicAddress: text(raw.clinicAddress, ''),
    clinicCro: text(raw.clinicCro, ''),
    technicalResponsible: text(raw.technicalResponsible, ''),
    professionalName: text(raw.professionalName, fallbacks.professionalName ?? ''),
    professionalCro: text(raw.professionalCro, fallbacks.professionalCro ?? ''),
    professionalSpecialty: text(raw.professionalSpecialty, ''),
    patientName: text(raw.patientName, fallbacks.patientName ?? ''),
    patientCpf: String(raw.patientCpf ?? '').replace(/\D/g, '').length === 11
      ? text(raw.patientCpf)
      : text(fallbacks.patientCpf, ''),
    patientCpfMasked: text(raw.patientCpfMasked, fallbacks.patientCpfMasked ?? ''),
    patientAddress: text(raw.patientAddress, ''),
    issuedAt: text(raw.generatedAt ?? raw.issuedAt, fallbacks.issuedAt ?? ''),
    issuedPlace: text(raw.issuedPlace ?? raw.clinicCity, ''),
  };
}

function signatureImage(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const dataUrl = (evidence as { dataUrl?: unknown }).dataUrl;
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image') ? dataUrl : null;
}

function asItems(raw: unknown): PrescriptionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is PrescriptionItem => Boolean(row) && typeof row === 'object');
}

function cidCitation(content: Record<string, unknown>): string {
  const code = String(content.cid ?? content.cidCode ?? '').trim();
  if (!code) return '';
  return formatDentalCidLine(code, typeof content.cidDescription === 'string' ? content.cidDescription : '');
}

function bodyFromFrozen(content?: Record<string, unknown> | null): string {
  if (!content) return 'Conteúdo clínico congelado na geração.';
  if (typeof content.renderedText === 'string' && content.renderedText.trim()) {
    return formatDatesInText(content.renderedText);
  }
  const corpo = text(content.corpo, '');
  const cid = cidCitation(content);
  const cidCode = String(content.cid ?? content.cidCode ?? '').trim();
  const parts = [
    corpo,
    text(content.prescricao, ''),
    text(content.observacoes, ''),
    content.daysAway != null ? `Afastamento: ${String(content.daysAway)} dia(s).` : '',
    content.startTime && content.endTime
      ? `Comparecimento: ${String(content.startTime)} às ${String(content.endTime)}.`
      : '',
    cid && (!cidCode || !corpo.includes(cidCode)) ? cid : '',
  ].filter(Boolean);
  return formatDatesInText(parts.join('\n\n') || 'Conteúdo clínico congelado na geração.');
}

function formatDatesInText(value: string) {
  return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, year: string, month: string, day: string) => `${day}/${month}/${year}`);
}

export function DocumentPreview({
  selectedMeta,
  document,
  prescription,
  media,
  history,
  loading,
  busy,
  patientId,
  patientName,
  patientCpf,
  professionalName,
  canSign,
  canArchive,
  canCancel,
  actionError,
  signing = false,
  onSign,
  onShare,
  onDownload,
  onPrint,
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
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
  professionalName: (id?: string | null) => string;
  canSign: boolean;
  canArchive: boolean;
  canCancel: boolean;
  actionError: string;
  signing?: boolean;
  onSign: (method: 'DRAWN' | 'A1') => void;
  onShare: () => void;
  onDownload: () => void;
  onPrint?: () => void;
  onRename: () => void;
  onArchive: () => void;
  onCancel: () => void;
}) {
  const { clinicId } = useSelection();
  const branding = useClinicBranding(clinicId, Boolean(clinicId));
  const accentColor = branding?.primaryColor;
  const professionalIdForA1 = selectedMeta?.source === 'prescription'
    ? prescription?.professionalId
    : selectedMeta?.source === 'generated'
      ? document?.professionalId
      : undefined;
  const [a1BlockedReason, setA1BlockedReason] = useState<string | null>(null);

  useEffect(() => {
    if (
      !clinicId
      || !professionalIdForA1
      || !selectedMeta
      || (selectedMeta.source !== 'generated' && selectedMeta.source !== 'prescription')
      || ['SIGNED', 'CANCELLED'].includes(selectedMeta.status)
    ) {
      setA1BlockedReason(null);
      return;
    }
    let cancelled = false;
    api.get<{ configured?: boolean }>(`/settings/certificate?clinicId=${clinicId}&professionalId=${professionalIdForA1}`)
      .then((status) => {
        if (cancelled) return;
        setA1BlockedReason(status.configured ? null : PROFESSIONAL_ECPF_REQUIRED_MESSAGE);
      })
      .catch(() => {
        if (!cancelled) setA1BlockedReason(null);
      });
    return () => { cancelled = true; };
  }, [clinicId, professionalIdForA1, selectedMeta?.id, selectedMeta?.source, selectedMeta?.status]);

  const previewError = actionError || a1BlockedReason || '';

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

  if (loading && !document && !prescription && !media) {
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
        <button
          type="button"
          className="icon-button"
          title="Imprimir"
          aria-label="Imprimir"
          disabled={busy}
          onClick={() => {
            if (onPrint) {
              onPrint();
              return;
            }
            const wrap = window.document.querySelector('.document-preview-panel .preview-wrap');
            if (!wrap) return;
            printHtmlDocument(
              `<!DOCTYPE html><html><head><title>${text(selectedMeta.name)}</title><style>${LEGAL_PRINT_CSS}</style></head><body>${wrap.innerHTML}</body></html>`,
              text(selectedMeta.name),
            );
          }}
        >
          <Printer size={15} />
        </button>
        {selectedMeta.source === 'upload' ? (
          <button type="button" className="icon-button" title="Renomear" aria-label="Renomear" disabled={busy} onClick={onRename}>
            <Pencil size={15} />
          </button>
        ) : null}
        {selectedMeta.source === 'generated' && canSign ? (
          <button type="button" className="icon-button" title="Assinatura remota" aria-label="Assinatura remota" disabled={busy} onClick={onShare}>
            <Share2 size={15} />
          </button>
        ) : null}
        <button type="button" className="icon-button" title="Baixar" aria-label="Baixar" disabled={busy} onClick={onDownload}>
          <Download size={15} />
        </button>
        {(selectedMeta.source === 'generated' || selectedMeta.source === 'prescription')
          && canSign
          && !['SIGNED', 'CANCELLED'].includes(status) ? (
          <button
            type="button"
            className="button small primary"
            title={a1BlockedReason ?? 'Assinar digitalmente'}
            aria-label={a1BlockedReason ?? 'Assinar digitalmente'}
            aria-busy={signing}
            disabled={busy || Boolean(a1BlockedReason)}
            onClick={() => {
              if (a1BlockedReason) return;
              onSign('A1');
            }}
          >
            <Stamp size={15} />
            {signing ? 'Assinando…' : 'Assinar digitalmente'}
          </button>
        ) : null}
        {canArchive ? (
          <button type="button" className="icon-button danger" title="Arquivar" aria-label="Arquivar" disabled={busy} onClick={onArchive}>
            <Archive size={15} />
          </button>
        ) : null}
        {selectedMeta.source !== 'upload' && canCancel && !['SIGNED', 'CANCELLED'].includes(status) ? (
          <button type="button" className="icon-button" title="Cancelar" aria-label="Cancelar" disabled={busy} onClick={onCancel}>
            <Ban size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );

  if (selectedMeta.source === 'upload' && media) {
    const file = media.file;
    const mime = String(file?.mimeType ?? '').toLowerCase();
    const isImage = mime.startsWith('image/') || ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
    const isPdf = mime === 'application/pdf' || media.type?.toUpperCase().includes('PDF');
    const isVideo = mime.startsWith('video/');
    return (
      <MediaPreviewPanel
        toolbar={toolbar}
        actionError={previewError}
        media={media}
        file={file}
        patientId={patientId}
        mediaId={String(media.id)}
        isImage={isImage}
        isPdf={Boolean(isPdf)}
        isVideo={isVideo}
      />
    );
  }

  if (selectedMeta.source === 'prescription' && prescription) {
    const items = asItems(prescription.items);
    const identity = identityFromRecord(
      (prescription.frozenIdentity ?? {}) as Record<string, unknown>,
      {
        patientName,
        patientCpf,
        professionalName: professionalName(prescription.professionalId),
        issuedAt: prescription.createdAt,
      },
    );
    const signatures: LegalSignatureView[] = [{
      role: 'PROFESSIONAL',
      signerName: identity.professionalName,
      method: prescription.status === 'SIGNED' ? 'A1' : undefined,
      signedAt: prescription.signedAt,
      detail: [identity.professionalName ? 'Cirurgião-dentista' : '', identity.professionalCro ? formatCro(identity.professionalCro) : ''].filter(Boolean).join(' · '),
    }];
    return (
      <div className="document-preview-panel">
        {toolbar}
        {previewError ? <p className="form-error detail-error" role="alert">{previewError}</p> : null}
        <div className="preview-wrap">
          <LegalDocumentPaper
            title="PRESCRIÇÃO ODONTOLÓGICA"
            identity={identity}
            identityRows={[
              { label: 'Paciente', value: text(identity.patientName, patientName) },
              { label: 'CPF', value: formatLegalCpf(identity.patientCpf || patientCpf) },
              { label: 'Endereço', value: text(identity.patientAddress, '—') },
              { label: 'Data', value: dateOnly(identity.issuedAt ?? prescription.createdAt) },
            ]}
            bodyItems={items.map((item, index) => ({
              title: `${index + 1}. ${item.medicationName}${item.concentration ? ` — ${item.concentration}` : ''}${item.pharmaceuticalForm ? ` — ${item.pharmaceuticalForm}` : ''}`,
              details: [
                item.route ? { label: 'Via', value: item.route } : null,
                item.quantity ? { label: 'Quantidade', value: item.quantity } : null,
                {
                  label: 'Posologia',
                  value: [item.dosage, item.frequency, item.duration].filter(Boolean).join(' ') || '—',
                },
                item.instructions ? { label: 'Orientações', value: item.instructions } : null,
              ].filter((row): row is { label: string; value: string } => Boolean(row)),
            }))}
            placeLine={formatLegalPlaceLine(identity)}
            signatures={signatures}
            validationCode={prescription.validationCode}
            accentColor={accentColor}
          />
        </div>
        {history.length ? <DocumentHistoryInline events={history} /> : null}
      </div>
    );
  }

  if (selectedMeta.source === 'generated' && document) {
    const frozen = document.frozenContent ?? {};
    const identity = identityFromRecord(
      (frozen.identity ?? {}) as Record<string, unknown>,
      {
        patientName,
        patientCpf,
        professionalName: professionalName(document.professionalId),
        issuedAt: document.generatedAt,
      },
    );
    const title = text(document.template?.name, selectedMeta.name).toUpperCase();
    const storedSignatures = (document.signatures ?? []).map((signature) => ({
      role: signature.role,
      signerName: signature.signerName,
      method: signature.method,
      signedAt: signature.signedAt,
      imageUrl: signatureImage(signature.evidence),
      detail: signature.role.toUpperCase().includes('PATIENT')
        ? ['Paciente', identity.patientCpf || patientCpf ? `CPF ${formatLegalCpf(identity.patientCpf || patientCpf)}` : ''].filter(Boolean).join(' · ')
        : ['Cirurgião-dentista', identity.professionalCro ? formatCro(identity.professionalCro) : ''].filter(Boolean).join(' · '),
    }));
    const signatures: LegalSignatureView[] = storedSignatures.length
      ? storedSignatures
      : [
        {
          role: 'PROFESSIONAL',
          signerName: identity.professionalName,
          detail: ['Cirurgião-dentista', identity.professionalCro ? formatCro(identity.professionalCro) : ''].filter(Boolean).join(' · '),
        },
        {
          role: 'PATIENT',
          signerName: identity.patientName,
          detail: ['Paciente', formatLegalCpf(identity.patientCpf || patientCpf) !== '—'
            ? `CPF ${formatLegalCpf(identity.patientCpf || patientCpf)}`
            : ''].filter(Boolean).join(' · '),
        },
      ];
    return (
      <div className="document-preview-panel">
        {toolbar}
        {previewError ? <p className="form-error detail-error" role="alert">{previewError}</p> : null}
        <div className="preview-wrap">
          <LegalDocumentPaper
            title={title}
            identity={identity}
            identityRows={[
              { label: 'Paciente', value: text(identity.patientName, patientName) },
              { label: 'CPF', value: formatLegalCpf(identity.patientCpf || patientCpf) },
              { label: 'Data do atendimento', value: dateOnly(identity.issuedAt ?? document.generatedAt) },
              { label: 'Local', value: text(identity.issuedPlace, '—') },
            ]}
            bodyText={bodyFromFrozen(frozen)}
            placeLine={formatLegalPlaceLine(identity)}
            signatures={signatures}
            validationCode={document.validationCode}
            accentColor={accentColor}
          />
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

function MediaPreviewPanel({
  toolbar,
  actionError,
  media,
  file,
  patientId,
  mediaId,
  isImage,
  isPdf,
  isVideo,
}: {
  toolbar: ReactNode;
  actionError: string;
  media: PatientMedia;
  file?: PatientMedia['file'];
  patientId: string;
  mediaId: string;
  isImage: boolean;
  isPdf: boolean;
  isVideo: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loadError, setLoadError] = useState('');
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!patientId || !mediaId || (!isImage && !isPdf && !isVideo)) return;
    let revoked = false;
    let created: string | null = null;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/patients/${patientId}/media/${mediaId}/download`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Falha ao carregar prévia autenticada.');
        const blob = await response.blob();
        created = URL.createObjectURL(blob);
        if (!revoked) setObjectUrl(created);
      } catch (error) {
        if (!revoked) setLoadError(error instanceof Error ? error.message : 'Prévia indisponível.');
      }
    })();
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [patientId, mediaId, isImage, isPdf, isVideo]);

  return (
    <div className="document-preview-panel">
      {toolbar}
      {actionError ? <p className="form-error detail-error" role="alert">{actionError}</p> : null}
      <div className="preview-wrap">
        {isImage && objectUrl ? (
          <div className="media-inline-preview">
            <div className="media-preview-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <button type="button" className="button ghost small" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="button ghost small" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
              <button type="button" className="button soft small" onClick={() => setLightbox(true)}>Ampliar</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt={text(media.displayName, file?.originalName)}
              style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: 420, transform: `scale(${zoom})`, transformOrigin: 'center top' }}
            />
            {lightbox ? (
              <div
                className="media-lightbox"
                role="dialog"
                onClick={() => setLightbox(false)}
                style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                  display: 'grid', placeItems: 'center', zIndex: 80,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={objectUrl} alt="" style={{ objectFit: 'contain', maxWidth: '95vw', maxHeight: '90vh' }} />
              </div>
            ) : null}
          </div>
        ) : null}
        {isPdf && objectUrl ? (
          <iframe title="Prévia PDF" src={objectUrl} style={{ width: '100%', minHeight: 480, border: 0 }} />
        ) : null}
        {isVideo && objectUrl ? (
          <video controls src={objectUrl} style={{ width: '100%', maxHeight: 420 }}>
            <track kind="captions" />
          </video>
        ) : null}
        {(!isImage && !isPdf && !isVideo) || loadError || (!objectUrl && (isImage || isPdf || isVideo)) ? (
          <div className="file-preview">
            <div className="big-icon">{typeLabel(media.type)}</div>
            <h2>{text(media.displayName, file?.originalName)}</h2>
            <p>{loadError || text(media.notes, 'Arquivo armazenado no prontuário do paciente.')}</p>
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
        ) : null}
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

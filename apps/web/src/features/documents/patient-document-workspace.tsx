'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { hasPermission, maskCpf, text } from '@/lib/format';
import { useAuth } from '@/components/auth-provider';
import type { Professional } from '@/components/selection-provider';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui';
import * as documentApi from './document-api';
import { CertificateEditor } from './certificate-editor';
import { DocumentEditor } from './document-editor';
import { DocumentFilters } from './document-filters';
import { DocumentLibrary } from './document-library';
import { DocumentPreview } from './document-preview';
import { DocumentUploadDialog } from './document-upload-dialog';
import { ExamRequestEditor } from './exam-request-editor';
import { folderSchema } from './document-schemas';
import { PrescriptionEditor } from './prescription-editor';
import { SignaturePanel } from './signature-panel';
import type {
  DocumentFiltersState,
  DocumentFolder,
  DocumentModal,
  DocumentTemplate,
  GeneratedDocument,
  LibraryItem,
  PatientMedia,
  Prescription,
  PrescriptionProtocol,
  SelectedLibraryRef,
} from './document-types';

export function PatientDocumentWorkspace({
  clinicId,
  patientId,
  patientName,
  patientCpf,
  professionals,
  onChanged,
}: {
  clinicId: string;
  patientId: string;
  patientName: string;
  patientCpf?: string | null;
  professionals: Professional[];
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const permissions = user?.permissions;

  const canView = hasPermission(permissions, 'document.view')
    || hasPermission(permissions, 'medical_record.view');
  const canCreate = hasPermission(permissions, 'document.create')
    || hasPermission(permissions, 'medical_record.create');
  const canSign = hasPermission(permissions, 'document.sign');
  const canArchive = hasPermission(permissions, 'document.archive');
  const canCancel = hasPermission(permissions, 'document.cancel');
  const canManageFolders = hasPermission(permissions, 'document.folder.manage');

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [protocols, setProtocols] = useState<PrescriptionProtocol[]>([]);
  const [treatments, setTreatments] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [filters, setFilters] = useState<DocumentFiltersState>({
    search: '',
    segment: 'all',
    folderId: 'all',
    includeArchived: false,
  });
  const [selected, setSelected] = useState<SelectedLibraryRef>(null);
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [media, setMedia] = useState<PatientMedia | null>(null);
  const [history, setHistory] = useState<GeneratedDocument['events']>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [modal, setModal] = useState<DocumentModal>(null);
  const [shareLink, setShareLink] = useState('');
  const [mobileShowPreview, setMobileShowPreview] = useState(false);
  const [message, setMessage] = useState('');

  const professionalName = useCallback(
    (id?: string | null) => professionals.find((row) => row.id === id)?.name ?? 'Profissional',
    [professionals],
  );

  const notify = useCallback(() => onChanged?.(), [onChanged]);

  const loadLibrary = useCallback(async () => {
    if (!clinicId || !patientId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [library, nextFolders, nextTemplates, nextProtocols, nextTreatments] = await Promise.all([
        documentApi.listDocumentLibrary(patientId, {
          includeArchived: filters.includeArchived,
        }),
        documentApi.listDocumentFolders(patientId).catch(() => [] as DocumentFolder[]),
        documentApi.listDocumentTemplates().catch(() => [] as DocumentTemplate[]),
        documentApi.listPrescriptionProtocols().catch(() => [] as PrescriptionProtocol[]),
        documentApi.listTreatmentPlansLite(clinicId, patientId).catch(() => []),
      ]);
      setItems(library);
      setFolders(nextFolders);
      setTemplates(nextTemplates);
      setProtocols(nextProtocols);
      setTreatments(nextTreatments);
      setSelected((current) => {
        if (current && library.some((row) => row.id === current.id && row.source === current.source)) {
          return current;
        }
        const first = library[0];
        return first ? { id: first.id, source: first.source } : null;
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível carregar a biblioteca.');
    } finally {
      setLoading(false);
    }
  }, [canView, clinicId, filters.includeArchived, patientId]);

  const loadDetail = useCallback(async (ref: SelectedLibraryRef) => {
    if (!ref) {
      setDocument(null);
      setPrescription(null);
      setMedia(null);
      setHistory([]);
      return;
    }
    setDetailLoading(true);
    setActionError('');
    try {
      if (ref.source === 'generated') {
        const [doc, events] = await Promise.all([
          documentApi.getDocument(ref.id),
          documentApi.getDocumentHistory(ref.id).catch(() => []),
        ]);
        setDocument(doc);
        setHistory(events);
        setPrescription(null);
        setMedia(null);
      } else if (ref.source === 'prescription') {
        const rx = await documentApi.getPrescription(ref.id);
        setPrescription(rx);
        setDocument(null);
        setMedia(null);
        setHistory([]);
      } else {
        const file = await documentApi.getMedia(patientId, ref.id);
        setMedia(file);
        setDocument(null);
        setPrescription(null);
        setHistory([]);
      }
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Falha ao carregar a prévia.');
      setDocument(null);
      setPrescription(null);
      setMedia(null);
      setHistory([]);
    } finally {
      setDetailLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    void loadDetail(selected);
  }, [loadDetail, selected]);

  const filteredItems = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.segment === 'generated' && item.source === 'upload') return false;
      if (filters.segment === 'uploads' && item.source !== 'upload') return false;
      if (filters.folderId !== 'all' && item.folderId !== filters.folderId) return false;
      if (!term) return true;
      const haystack = [item.name, item.type, item.folderName ?? '', item.validationCode ?? ''].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [filters.folderId, filters.search, filters.segment, items]);

  const selectedMeta = filteredItems.find(
    (item) => item.id === selected?.id && item.source === selected.source,
  ) ?? items.find((item) => item.id === selected?.id && item.source === selected.source) ?? null;

  async function runAction<T>(action: () => Promise<T>, select?: SelectedLibraryRef | ((result: T) => SelectedLibraryRef | null | undefined)) {
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      const result = await action();
      await loadLibrary();
      const next = typeof select === 'function' ? select(result) : select;
      if (next) setSelected(next);
      else if (selected) await loadDetail(selected);
      notify();
      return result;
    } catch (cause) {
      setActionError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const name = window.prompt('Nome da nova pasta:');
    if (!name) return;
    const parsed = folderSchema.safeParse({ name });
    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? 'Nome inválido.');
      return;
    }
    await runAction(async () => {
      await documentApi.createDocumentFolder(patientId, parsed.data.name);
      setMessage('Pasta criada.');
    });
  }

  if (!canView) {
    return (
      <Panel title="Documentos" description="Acesso restrito">
        <EmptyState title="Sem permissão" description="É necessário document.view para visualizar a biblioteca." />
      </Panel>
    );
  }

  if (loading) {
    return (
      <div className="documents-workspace">
        <Skeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void loadLibrary()} />;
  }

  return (
    <div className="documents-workspace">
      {message ? <div className="secure-notice">{message}</div> : null}

      <section className="document-quick-actions" aria-label="Ações rápidas">
        <button type="button" className="action-card" disabled={!canCreate} onClick={() => { setModal('generate'); setActionError(''); }}>
          <span className="action-icon">DOC</span>
          <span>
            <strong>Gerar documento</strong>
            <small>Atestado, termo, declaração ou encaminhamento</small>
          </span>
        </button>
        <button type="button" className="action-card" disabled={!canCreate} onClick={() => { setModal('prescription'); setActionError(''); }}>
          <span className="action-icon blue">RX</span>
          <span>
            <strong>Nova prescrição</strong>
            <small>Medicamentos, exames e texto estruturado</small>
          </span>
        </button>
        <button type="button" className="action-card" disabled={!canCreate} onClick={() => { setModal('certificate'); setActionError(''); }}>
          <span className="action-icon purple">AT</span>
          <span>
            <strong>Emitir atestado</strong>
            <small>Dias, horas, comparecimento e CID autorizado</small>
          </span>
        </button>
        <button type="button" className="action-card" disabled={!canCreate} onClick={() => { setModal('exam-request'); setActionError(''); }}>
          <span className="action-icon blue">EX</span>
          <span>
            <strong>Solicitar exame</strong>
            <small>Lista estruturada, indicação e urgência</small>
          </span>
        </button>
        <button type="button" className="action-card" disabled={!canCreate} onClick={() => { setModal('upload'); setActionError(''); }}>
          <span className="action-icon amber">↑</span>
          <span>
            <strong>Enviar arquivos</strong>
            <small>Fotos, radiografias, PDFs e exames</small>
          </span>
        </button>
      </section>

      <div className={`documents-layout ${mobileShowPreview ? 'show-preview' : ''}`}>
        <Panel className="documents-library-panel" title="Biblioteca do paciente" description="Documentos gerados, receitas e arquivos enviados.">
          <DocumentFilters
            value={filters}
            onChange={(next) => setFilters(next)}
          />
          <DocumentLibrary
            folders={folders}
            items={filteredItems}
            selected={selected}
            folderId={filters.folderId}
            canManageFolders={canManageFolders}
            onCreateFolder={() => void createFolder()}
            onSelectFolder={(folderId) => setFilters((current) => ({ ...current, folderId }))}
            onSelectItem={(item) => {
              setSelected({ id: item.id, source: item.source });
              setMobileShowPreview(true);
            }}
          />
        </Panel>

        <Panel className="documents-preview-panel">
          <button type="button" className="text-button mobile-back" onClick={() => setMobileShowPreview(false)}>
            ← Voltar à biblioteca
          </button>
          <DocumentPreview
            selectedMeta={selectedMeta}
            document={document}
            prescription={prescription}
            media={media}
            history={history ?? []}
            loading={detailLoading}
            busy={busy}
            patientName={patientName}
            patientCpfMasked={maskCpf(patientCpf)}
            professionalName={professionalName}
            canSign={canSign}
            canArchive={canArchive || (selectedMeta?.source === 'upload' && canCreate)}
            canCancel={canCancel}
            actionError={actionError}
            onSign={(method) => {
              if (!selectedMeta) return;
              if (selectedMeta.source === 'prescription') {
                void runAction(async () => {
                  await documentApi.signPrescription(selectedMeta.id);
                  setMessage('Prescrição assinada.');
                });
                return;
              }
              if (selectedMeta.source !== 'generated') return;
              void runAction(async () => {
                await documentApi.signDocument(selectedMeta.id, {
                  signerName: user?.name ?? professionalName(document?.professionalId),
                  role: 'PROFESSIONAL',
                  method,
                  clinicId,
                  evidence: { source: 'documents-workspace' },
                });
                setMessage(method === 'A1' ? 'Assinatura A1 registrada.' : 'Assinatura registrada.');
              });
            }}
            onShare={() => {
              setShareLink('');
              setModal('share');
              setActionError('');
            }}
            onDownload={() => {
              if (!selectedMeta) return;
              void runAction(async () => {
                if (selectedMeta.source === 'generated') {
                  await documentApi.downloadDocumentPdf(selectedMeta.id, selectedMeta.name);
                } else if (selectedMeta.source === 'prescription') {
                  await documentApi.downloadPrescriptionPdf(selectedMeta.id, selectedMeta.name);
                } else {
                  await documentApi.downloadMedia(patientId, selectedMeta.id, selectedMeta.name);
                }
                setMessage('Download iniciado.');
              });
            }}
            onRename={() => {
              if (!selectedMeta || selectedMeta.source !== 'upload') return;
              const name = window.prompt('Novo nome do arquivo:', selectedMeta.name);
              if (!name?.trim()) return;
              void runAction(async () => {
                await documentApi.patchMedia(patientId, selectedMeta.id, { displayName: name.trim() });
                setMessage('Arquivo renomeado.');
              });
            }}
            onArchive={() => {
              if (!selectedMeta) return;
              const confirmed = window.confirm(`Arquivar “${selectedMeta.name}”?`);
              if (!confirmed) return;
              void runAction(async () => {
                if (selectedMeta.source === 'upload') {
                  await documentApi.archiveMedia(patientId, selectedMeta.id);
                } else if (selectedMeta.source === 'generated') {
                  await documentApi.archiveDocument(selectedMeta.id);
                } else {
                  await documentApi.cancelPrescription(selectedMeta.id, 'Arquivado pela biblioteca');
                }
                setSelected(null);
                setMessage('Item arquivado/cancelado.');
              });
            }}
            onCancel={() => {
              if (!selectedMeta || selectedMeta.source === 'upload') return;
              const reason = window.prompt('Motivo do cancelamento (mín. 3 caracteres):');
              if (!reason || reason.trim().length < 3) return;
              void runAction(async () => {
                if (selectedMeta.source === 'generated') {
                  await documentApi.cancelDocument(selectedMeta.id, reason.trim());
                } else {
                  await documentApi.cancelPrescription(selectedMeta.id, reason.trim());
                }
                setMessage('Documento cancelado.');
              });
            }}
          />
        </Panel>
      </div>

      <DocumentEditor
        open={modal === 'generate'}
        templates={templates}
        professionals={professionals}
        folders={folders}
        treatments={treatments}
        busy={busy}
        error={actionError}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          await runAction(async () => {
            const created = await documentApi.generateDocument({
              clinicId,
              patientId,
              templateId: input.templateId,
              professionalId: input.professionalId,
              treatmentId: input.treatmentId,
              folderId: input.folderId,
              clinicalContent: input.clinicalContent,
            });
            setMobileShowPreview(true);
            setMessage('Documento gerado como rascunho congelado.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'generated' as const }));
        }}
      />

      <PrescriptionEditor
        open={modal === 'prescription'}
        professionals={professionals}
        folders={folders}
        protocols={protocols}
        busy={busy}
        error={actionError}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          await runAction(async () => {
            const created = await documentApi.createPrescription({
              clinicId,
              patientId,
              ...input,
            });
            setMobileShowPreview(true);
            setMessage('Prescrição gerada e pronta para assinatura.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'prescription' as const }));
        }}
        onSaveProtocol={async (input) => {
          await runAction(async () => {
            await documentApi.createPrescriptionProtocol(input);
            setProtocols(await documentApi.listPrescriptionProtocols());
            setMessage('Protocolo salvo.');
          });
        }}
      />

      <CertificateEditor
        open={modal === 'certificate'}
        templates={templates}
        professionals={professionals}
        folders={folders}
        actorId={user?.id}
        busy={busy}
        error={actionError}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          await runAction(async () => {
            const created = await documentApi.generateDocument({
              clinicId,
              patientId,
              templateId: input.templateId,
              professionalId: input.professionalId,
              folderId: input.folderId,
              clinicalContent: input.clinicalContent,
            });
            setMobileShowPreview(true);
            setMessage('Atestado gerado e pronto para assinatura.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'generated' as const }));
        }}
      />

      <ExamRequestEditor
        open={modal === 'exam-request'}
        templates={templates}
        professionals={professionals}
        folders={folders}
        busy={busy}
        error={actionError}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          await runAction(async () => {
            const created = await documentApi.generateDocument({
              clinicId,
              patientId,
              templateId: input.templateId,
              professionalId: input.professionalId,
              folderId: input.folderId,
              clinicalContent: input.clinicalContent,
            });
            setMobileShowPreview(true);
            setMessage('Solicitação de exame gerada.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'generated' as const }));
        }}
      />

      <DocumentUploadDialog
        open={modal === 'upload'}
        folders={folders}
        busy={busy}
        error={actionError}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          await runAction(async () => {
            let lastId: string | null = null;
            for (const file of input.files) {
              const form = new FormData();
              form.set('clinicId', clinicId);
              form.set('type', input.type);
              if (input.folderId) form.set('folderId', input.folderId);
              if (input.notes) form.set('notes', input.notes);
              form.set('displayName', file.name);
              form.set('file', file);
              const uploaded = await documentApi.uploadMedia(patientId, form);
              lastId = uploaded.id;
            }
            setMobileShowPreview(true);
            setMessage(input.files.length > 1 ? 'Arquivos enviados.' : 'Arquivo enviado.');
            setModal(null);
            return lastId;
          }, (lastId) => (lastId ? { id: lastId, source: 'upload' as const } : null));
        }}
      />

      <SignaturePanel
        open={modal === 'share'}
        busy={busy}
        error={actionError}
        defaultSignerName={patientName}
        shareLink={shareLink}
        onClose={() => setModal(null)}
        onSubmit={async (input) => {
          if (!selected || selected.source !== 'generated') {
            setActionError('Selecione um documento gerado para compartilhar.');
            return;
          }
          setBusy(true);
          setActionError('');
          try {
            const result = await documentApi.createSignatureRequest(selected.id, input);
            const absolute = `${window.location.origin}${result.publicPath}`;
            setShareLink(absolute);
            try {
              await navigator.clipboard.writeText(absolute);
              setMessage('Link de assinatura remota gerado e copiado.');
            } catch {
              setMessage('Link de assinatura remota gerado.');
            }
            await loadDetail(selected);
          } catch (cause) {
            setActionError(cause instanceof ApiError ? cause.message : 'Falha ao criar solicitação.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import { hasPermission, maskCpf } from '@/lib/format';
import { publicAppUrl } from '@/lib/public-url';
import { useAuth } from '@/components/auth-provider';
import type { Professional } from '@/components/selection-provider';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui';
import { Modal } from '@/components/modal';
import * as documentApi from './document-api';
import { CertificateEditor } from './certificate-editor';
import { ConsentEditor } from './consent-editor';
import { DocumentEditor } from './document-editor';
import { ReferralEditor } from './referral-editor';
import { DocumentLibrary } from './document-library';
import { DocumentPreview } from './document-preview';
import { DocumentUploadDialog } from './document-upload-dialog';
import { ExamRequestEditor } from './exam-request-editor';
import { folderSchema } from './document-schemas';
import { NewDocumentPicker } from './new-document-picker';
import { PrescriptionEditor } from './prescription-editor';
import { SignaturePanel } from './signature-panel';
import type {
  DocumentFiltersState,
  DocumentFolder,
  DocumentModal,
  DocumentsHomeTab,
  DocumentTemplate,
  FileKindFilter,
  GeneratedDocument,
  LibraryItem,
  NewDocumentKind,
  PatientMedia,
  Prescription,
  PrescriptionProtocol,
  SelectedLibraryRef,
} from './document-types';

const FILE_KIND_FILTERS: Array<{ id: FileKindFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'photos', label: 'Fotos' },
  { id: 'radiographs', label: 'Radiografias' },
  { id: 'pdfs', label: 'PDFs' },
  { id: 'videos', label: 'Vídeos' },
  { id: 'other', label: 'Outros' },
];

function matchesFileKind(item: LibraryItem, kind: FileKindFilter): boolean {
  if (kind === 'all') return true;
  const type = `${item.type} ${item.name}`.toUpperCase();
  if (kind === 'photos') return /PHOTO|IMAGE|IMG|JPG|JPEG|PNG|WEBP/.test(type);
  if (kind === 'radiographs') return /RADIO|RX|XRAY|PANORAM|PERIAP|TOMO/.test(type);
  if (kind === 'pdfs') return /PDF/.test(type);
  if (kind === 'videos') return /VIDEO|MP4|MOV/.test(type);
  return !/PHOTO|IMAGE|IMG|JPG|JPEG|PNG|WEBP|RADIO|RX|XRAY|PANORAM|PERIAP|TOMO|PDF|VIDEO|MP4|MOV/.test(type);
}

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

  const [homeTab, setHomeTab] = useState<DocumentsHomeTab>('documents');
  const [fileKind, setFileKind] = useState<FileKindFilter>('all');
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
  const [promptForm, setPromptForm] = useState<null | {
    title: string;
    description: string;
    initial?: string;
    confirmLabel: string;
    danger?: boolean;
    requireMin?: number;
    onConfirm: (value: string) => void;
  }>(null);
  const [promptValue, setPromptValue] = useState('');
  const [confirmForm, setConfirmForm] = useState<null | {
    title: string;
    description: string;
    onConfirm: () => void;
  }>(null);

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
        return null;
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
      if (homeTab === 'documents' && item.source === 'upload') return false;
      if (homeTab === 'files' && item.source !== 'upload') return false;
      if (homeTab === 'files' && !matchesFileKind(item, fileKind)) return false;
      if (filters.folderId !== 'all' && item.folderId !== filters.folderId) return false;
      if (!term) return true;
      const haystack = [item.name, item.type, item.folderName ?? '', item.validationCode ?? ''].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [fileKind, filters.folderId, filters.search, homeTab, items]);

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
    setPromptValue('');
    setPromptForm({
      title: 'Nova pasta',
      description: 'Informe o nome da pasta.',
      confirmLabel: 'Criar',
      requireMin: 2,
      onConfirm: (name) => {
        const parsed = folderSchema.safeParse({ name });
        if (!parsed.success) {
          setActionError(parsed.error.issues[0]?.message ?? 'Nome inválido.');
          return;
        }
        void runAction(async () => {
          await documentApi.createDocumentFolder(patientId, parsed.data.name);
          setMessage('Pasta criada.');
        });
      },
    });
  }

  function openNewDocument(kind: NewDocumentKind) {
    setActionError('');
    setModal(kind);
  }

  function switchHomeTab(tab: DocumentsHomeTab) {
    setHomeTab(tab);
    setSelected(null);
    setMobileShowPreview(false);
    setFilters((current) => ({
      ...current,
      search: '',
      folderId: 'all',
      segment: tab === 'files' ? 'uploads' : 'generated',
    }));
    setFileKind('all');
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

      <div className="doc-home-tabs" role="tablist" aria-label="Documentos e arquivos">
        <button
          type="button"
          role="tab"
          aria-selected={homeTab === 'documents'}
          className={homeTab === 'documents' ? 'active' : ''}
          onClick={() => switchHomeTab('documents')}
        >
          Documentos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={homeTab === 'files'}
          className={homeTab === 'files' ? 'active' : ''}
          onClick={() => switchHomeTab('files')}
        >
          Arquivos
        </button>
      </div>

      <div className="doc-home-toolbar">
        <div>
          <strong>{homeTab === 'documents' ? 'Documentos emitidos' : 'Arquivos do paciente'}</strong>
          <p className="muted-note">
            {homeTab === 'documents'
              ? 'Receitas, atestados, exames, termos e documentos personalizados.'
              : 'Fotos, radiografias, PDFs e vídeos — preview em primeiro plano.'}
          </p>
        </div>
        {homeTab === 'documents' ? (
          <button
            type="button"
            className="button primary"
            disabled={!canCreate}
            onClick={() => { setModal('picker'); setActionError(''); }}
          >
            ＋ Novo documento
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={!canCreate}
            onClick={() => { setModal('upload'); setActionError(''); }}
          >
            ＋ Enviar arquivo
          </button>
        )}
      </div>

      <div className={`documents-layout ${homeTab === 'files' ? 'files-priority' : ''} ${mobileShowPreview ? 'show-preview' : ''}`}>
        <Panel
          className="documents-library-panel"
          title={homeTab === 'documents' ? 'Biblioteca de documentos' : 'Biblioteca de arquivos'}
          description={homeTab === 'documents' ? 'Emitidos e assinados.' : 'Uploads e pastas.'}
        >
          <div className="document-filters">
            <input
              placeholder={homeTab === 'documents' ? 'Buscar documento' : 'Buscar arquivo'}
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              aria-label={homeTab === 'documents' ? 'Buscar documentos' : 'Buscar arquivos'}
            />
            {homeTab === 'files' ? (
              <div className="segmented" role="tablist" aria-label="Tipo de arquivo">
                {FILE_KIND_FILTERS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    role="tab"
                    aria-selected={fileKind === kind.id}
                    className={fileKind === kind.id ? 'active' : ''}
                    onClick={() => setFileKind(kind.id)}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="check-field compact">
              <input
                type="checkbox"
                checked={filters.includeArchived}
                onChange={(event) => setFilters((current) => ({ ...current, includeArchived: event.target.checked }))}
              />
              Incluir arquivados
            </label>
          </div>
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
            patientId={patientId}
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
              setPromptValue(selectedMeta.name);
              setPromptForm({
                title: 'Renomear arquivo',
                description: 'Informe o novo nome.',
                initial: selectedMeta.name,
                confirmLabel: 'Salvar',
                requireMin: 1,
                onConfirm: (name) => {
                  void runAction(async () => {
                    await documentApi.patchMedia(patientId, selectedMeta.id, { displayName: name.trim() });
                    setMessage('Arquivo renomeado.');
                  });
                },
              });
            }}
            onArchive={() => {
              if (!selectedMeta) return;
              setConfirmForm({
                title: 'Arquivar item',
                description: `Arquivar “${selectedMeta.name}”?`,
                onConfirm: () => {
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
                },
              });
            }}
            onCancel={() => {
              if (!selectedMeta || selectedMeta.source === 'upload') return;
              setPromptValue('');
              setPromptForm({
                title: 'Cancelar documento',
                description: 'Informe o motivo (mín. 3 caracteres).',
                confirmLabel: 'Cancelar documento',
                danger: true,
                requireMin: 3,
                onConfirm: (reason) => {
                  void runAction(async () => {
                    if (selectedMeta.source === 'generated') {
                      await documentApi.cancelDocument(selectedMeta.id, reason);
                    } else {
                      await documentApi.cancelPrescription(selectedMeta.id, reason);
                    }
                    setMessage('Documento cancelado.');
                  });
                },
              });
            }}
          />
        </Panel>
      </div>

      <NewDocumentPicker
        open={modal === 'picker'}
        disabled={!canCreate || busy}
        onClose={() => setModal(null)}
        onSelect={openNewDocument}
      />

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
            setHomeTab('documents');
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
            setHomeTab('documents');
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
            setHomeTab('documents');
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
            setHomeTab('documents');
            setMobileShowPreview(true);
            setMessage('Solicitação de exame gerada.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'generated' as const }));
        }}
      />

      <ConsentEditor
        open={modal === 'consent'}
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
            setHomeTab('documents');
            setMobileShowPreview(true);
            setMessage('Termo gerado como rascunho congelado.');
            setModal(null);
            return created;
          }, (created) => ({ id: created.id, source: 'generated' as const }));
        }}
      />

      <ReferralEditor
        open={modal === 'referral'}
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
            setHomeTab('documents');
            setMobileShowPreview(true);
            setMessage('Encaminhamento gerado como rascunho congelado.');
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
            setHomeTab('files');
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
            const absolute = publicAppUrl(result.publicPath);
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

      <Modal
        open={Boolean(promptForm)}
        title={promptForm?.title ?? ''}
        description={promptForm?.description}
        onClose={() => setPromptForm(null)}
      >
        <form
          className="mutation-form"
          onSubmit={(event) => {
            event.preventDefault();
            const min = promptForm?.requireMin ?? 1;
            if (!promptForm || promptValue.trim().length < min) return;
            const confirm = promptForm.onConfirm;
            setPromptForm(null);
            confirm(promptValue.trim());
          }}
        >
          <label className="span-2">Valor
            <input required minLength={promptForm?.requireMin ?? 1} value={promptValue} onChange={(event) => setPromptValue(event.target.value)} />
          </label>
          <div className="modal-footer">
            <button type="button" className="button ghost" onClick={() => setPromptForm(null)}>Voltar</button>
            <button
              type="submit"
              className={`button ${promptForm?.danger ? 'danger' : 'primary'}`}
              disabled={busy || promptValue.trim().length < (promptForm?.requireMin ?? 1)}
            >
              {promptForm?.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmForm)}
        title={confirmForm?.title ?? ''}
        description={confirmForm?.description}
        onClose={() => setConfirmForm(null)}
      >
        <div className="modal-footer">
          <button type="button" className="button ghost" onClick={() => setConfirmForm(null)}>Voltar</button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => {
              const confirm = confirmForm?.onConfirm;
              setConfirmForm(null);
              confirm?.();
            }}
          >
            Confirmar
          </button>
        </div>
      </Modal>
    </div>
  );
}

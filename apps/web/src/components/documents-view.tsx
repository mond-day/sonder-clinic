'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { dateOnly, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { useSelection } from './selection-provider';
import { EmptyState, PageHeader, Panel, StatusBadge } from './ui';

type Template = RecordValue & {
  id: string;
  name: string;
  type: string;
  version: number;
  structuredContent?: RecordValue;
  signatureRules?: RecordValue;
};

type DocumentRow = RecordValue & {
  id: string;
  patientId: string;
  status: string;
  validationCode: string;
  templateVersion: number;
  generatedAt: string;
  frozenContent?: RecordValue;
  template?: Template;
  signatures?: RecordValue[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function paperBody(template?: Template | null, document?: DocumentRow | null, patientName?: string) {
  const content = document?.frozenContent ?? {};
  const structured = template?.structuredContent ?? {};
  const title = text(content.titulo, text(template?.name, 'Documento clínico'));
  const lines = [
    text(content.prescricao, ''),
    text(content.corpo, ''),
    text(content.observacoes, ''),
    Array.isArray(structured.blocos) ? (structured.blocos as string[]).map((item) => `• ${item}`).join('\n') : '',
  ].filter(Boolean);

  return {
    title,
    patientName: text(content.paciente, patientName ?? 'Paciente selecionado'),
    lines: lines.length ? lines : ['Conteúdo configurável do modelo.', 'Variáveis preenchidas na geração.'],
    dateLabel: dateOnly(content.data ?? document?.generatedAt ?? new Date().toISOString()),
  };
}

export function DocumentsView() {
  const { clinicId } = useSelection();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [query, setQuery] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ clinicId });
      if (patientId) params.set('patientId', patientId);
      const [templatesRaw, documentsRaw, patientsRaw] = await Promise.all([
        api.get<Template[]>('/document-templates'),
        api.get<DocumentRow[]>(`/documents?${params}`),
        api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      ]);
      const nextTemplates = list(templatesRaw) as Template[];
      const nextDocuments = list(documentsRaw) as DocumentRow[];
      const nextPatients = list(patientsRaw);
      setTemplates(nextTemplates);
      setDocuments(nextDocuments);
      setPatients(nextPatients);
      if (!selectedTemplateId && nextTemplates[0]) setSelectedTemplateId(nextTemplates[0].id);
      if (selectedDocumentId && !nextDocuments.some((item) => item.id === selectedDocumentId)) {
        setSelectedDocumentId(null);
      }
      if (!patientId) {
        const stored = window.localStorage.getItem('sonder.selectedPatientId');
        if (stored && nextPatients.some((item) => item.id === stored)) setPatientId(stored);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar documentos.');
    } finally {
      setLoading(false);
    }
  }, [clinicId, patientId, selectedDocumentId, selectedTemplateId]);

  useEffect(() => { void load(); }, [load]);

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId) ?? null;
  const selectedDocument = documents.find((item) => item.id === selectedDocumentId) ?? null;
  const patientName = text(patients.find((item) => item.id === patientId)?.fullName, '');
  const paper = useMemo(
    () => paperBody(selectedTemplate, selectedDocument, patientName),
    [selectedTemplate, selectedDocument, patientName],
  );

  const filteredTemplates = templates.filter((item) => (
    !query || text(item.name).toLowerCase().includes(query.toLowerCase())
  ));

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!selectedTemplateId || !patientId) {
      setError('Selecione paciente e modelo.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await api.post<DocumentRow>('/documents/generate', {
        clinicId,
        patientId,
        templateId: selectedTemplateId,
        frozenContent: {
          titulo: selectedTemplate?.name,
          paciente: patientName,
          observacoes: draftContent,
          data: new Date().toISOString(),
          prescricao: draftContent || '[Conteúdo clínico]',
        },
      });
      setSelectedDocumentId(created.id);
      setMessage('Documento gerado como rascunho imutável de conteúdo.');
      setDraftContent('');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível gerar o documento.');
    } finally {
      setBusy(false);
    }
  }

  async function signDocument() {
    if (!selectedDocument) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/documents/${selectedDocument.id}/sign`, {
        signerName: patientName || 'Paciente',
        role: 'PATIENT',
        method: 'DRAWN',
        evidence: { source: 'documents-paper-ui' },
      });
      setMessage('Assinatura registrada.');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao assinar.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!selectedDocument) {
      setError('Gere ou selecione um documento para exportar PDF.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/documents/${selectedDocument.id}/pdf`, { credentials: 'include' });
      if (!response.ok) throw new ApiError('Falha ao gerar PDF.', response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${text(selectedDocument.template?.name, 'documento')}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha no download do PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="documents-view">
      <PageHeader
        eyebrow="Clínico"
        title="Documentos do paciente"
        description="Biblioteca de modelos, prévia paper, PDF gráfico e assinaturas presenciais/remotas/A1."
        actions={(
          <>
            <button type="button" className="button soft" disabled={busy || loading} onClick={() => void load()}>Atualizar</button>
            <button type="button" className="button primary" disabled={busy || !selectedTemplateId || !patientId} onClick={() => {
              const form = document.querySelector<HTMLFormElement>('.documents-view form.toolbar');
              form?.requestSubmit();
            }}>
              Gerar documento
            </button>
          </>
        )}
      />
      {error ? <div className="secure-notice form-error" role="alert">{error}</div> : null}
      {message ? <div className="secure-notice">{message}</div> : null}

      <Panel title="Biblioteca de documentos" description="Modelos, prévia, edição, assinatura e histórico em uma mesma experiência.">
        <div className="document-paper-grid">
          <aside className="doc-list">
            <label className="field-block">
              Paciente
              <select
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                  window.localStorage.setItem('sonder.selectedPatientId', event.target.value);
                }}
              >
                <option value="">Selecione</option>
                {patients.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.fullName)}</option>)}
              </select>
            </label>
            <div className="filters" style={{ marginBottom: 10 }}>
              <input
                style={{ minWidth: 0, width: '100%' }}
                placeholder="Pesquisar modelo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`doc-template ${selectedTemplateId === template.id && !selectedDocumentId ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setSelectedDocumentId(null);
                }}
              >
                <strong>{text(template.name)}</strong>
                <br />
                <small>{presentationLabel(template.type)} · v{template.version}</small>
              </button>
            ))}
            <hr />
            <small className="eyebrow">Gerados</small>
            {documents.length === 0 ? <p className="muted-note">Nenhum documento gerado para o filtro atual.</p> : null}
            {documents.map((document) => (
              <button
                key={document.id}
                type="button"
                className={`doc-template ${selectedDocumentId === document.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDocumentId(document.id);
                  setSelectedTemplateId(document.templateId ? String(document.templateId) : selectedTemplateId);
                }}
              >
                <strong>{text(document.template?.name, document.validationCode)}</strong>
                <br />
                <small>{presentationLabel(document.status)} · {dateOnly(document.generatedAt)}</small>
              </button>
            ))}
          </aside>

          <div>
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <StatusBadge tone={selectedDocument ? (selectedDocument.status === 'SIGNED' ? 'green' : 'amber') : 'blue'}>
                  {selectedDocument ? presentationLabel(selectedDocument.status) : 'Prévia do modelo'}
                </StatusBadge>
                {' '}
                <StatusBadge tone="blue">Variáveis preenchidas</StatusBadge>
              </div>
              <div className="toolbar">
                <button type="button" className="button soft" disabled={busy || !selectedDocument} onClick={() => void downloadPdf()}>Gerar PDF</button>
                <button type="button" className="button soft" disabled={busy || !selectedDocument || selectedDocument.status === 'SIGNED'} onClick={() => void signDocument()}>
                  Registrar assinatura
                </button>
              </div>
            </div>

            <article className="paper">
              <p>
                <strong>SONDER CLINIC</strong>
                <br />
                Documento clínico · CRO responsável conforme clínica
              </p>
              <h2>{paper.title.toUpperCase()}</h2>
              <p>
                Paciente: <strong>{paper.patientName}</strong>
                <br />
                Data: {paper.dateLabel}
              </p>
              {paper.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p style={{ marginTop: 70 }}>{paper.dateLabel}</p>
              <div className="paper-signatures">
                <div>Assinatura do profissional<br />A1 ou assinatura na tela</div>
                <div>Assinatura do paciente<br />Presencial ou link remoto</div>
              </div>
              {selectedDocument ? (
                <p className="muted-note" style={{ marginTop: 24, textAlign: 'center' }}>
                  Código: {selectedDocument.validationCode}
                </p>
              ) : null}
            </article>

            <form className="toolbar" style={{ justifyContent: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }} onSubmit={generate}>
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="Conteúdo complementar / prescrição"
                rows={2}
                style={{ width: '100%', maxWidth: 640 }}
              />
              <button type="submit" className="button" disabled={busy}>Salvar rascunho / gerar</button>
              <button type="button" className="button" disabled={busy || !selectedDocument} onClick={() => window.print()}>Imprimir</button>
              <button type="button" className="button" disabled={busy || !selectedDocument} onClick={() => void downloadPdf()}>Baixar</button>
              <button type="button" className="button primary" disabled={busy || !selectedDocument || selectedDocument.status === 'SIGNED'} onClick={() => void signDocument()}>
                Registrar assinatura
              </button>
            </form>

            {!loading && templates.length === 0 ? (
              <EmptyState title="Sem modelos" description="Cadastre modelos via API de document-templates." />
            ) : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

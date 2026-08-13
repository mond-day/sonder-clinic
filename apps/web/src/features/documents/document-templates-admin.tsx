'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, Panel, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import * as documentApi from './document-api';

const TEMPLATE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ATTESTATION', label: 'Atestado' },
  { value: 'PRESCRIPTION', label: 'Receita' },
  { value: 'EXAM_REQUEST', label: 'Solicitação de exame' },
  { value: 'DECLARATION', label: 'Declaração' },
  { value: 'CONSENT', label: 'Termo de consentimento' },
  { value: 'REFERRAL', label: 'Encaminhamento' },
  { value: 'CONTRACT', label: 'Contrato' },
  { value: 'TREATMENT_PLAN', label: 'Plano de tratamento' },
  { value: 'ODONTOGRAM', label: 'Odontograma' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

const VARIABLES = [
  'patientName',
  'patientCpf',
  'professionalName',
  'professionalCro',
  'clinicName',
  'date',
  'clinic.tradeName',
  'clinic.legalName',
  'clinic.taxId',
  'patient.fullName',
  'patient.cpf',
  'treatment.title',
  'treatment.total',
  'payment.clause',
  'payment.summary',
] as const;

type StructuredContent = {
  title?: string;
  header?: string;
  body?: string;
  footer?: string;
  signature?: string;
};

type TemplateRow = RecordValue & {
  id: string;
  name: string;
  type: string;
  version?: number;
  status?: string;
  active?: boolean;
  structuredContent?: StructuredContent;
  allowedVariables?: string[];
  signatureRules?: Record<string, unknown>;
};

const SAMPLE = {
  patientName: 'Maria de Exemplo',
  patientCpf: '000.000.000-00',
  professionalName: 'Dr. Exemplo',
  professionalCro: 'MT-00000',
  clinicName: 'Clínica Exemplo',
  date: new Date().toLocaleDateString('pt-BR'),
};

function applyVariables(source: string) {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return (SAMPLE as Record<string, string>)[key] ?? `{{${key}}}`;
  });
}

function emptyContent(): StructuredContent {
  return {
    title: '',
    header: '',
    body: '',
    footer: '',
    signature: '{{professionalName}} — CRO {{professionalCro}}',
  };
}

/** Admin de modelos: editar DRAFT, preview, validar e publicar. */
export function DocumentTemplatesAdminPanel() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editor, setEditor] = useState<TemplateRow | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [content, setContent] = useState<StructuredContent>(emptyContent());
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('CUSTOM');
  const [validation, setValidation] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    documentApi.listDocumentTemplates(true)
      .then((data) => setRows(list(data as unknown as RecordValue[]) as TemplateRow[]))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar modelos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const previewHtml = useMemo(() => ({
    title: applyVariables(content.title ?? ''),
    header: applyVariables(content.header ?? ''),
    body: applyVariables(content.body ?? ''),
    footer: applyVariables(content.footer ?? ''),
    signature: applyVariables(content.signature ?? ''),
  }), [content]);

  function openEditor(row: TemplateRow) {
    const structured = (row.structuredContent ?? {}) as StructuredContent;
    setEditor(row);
    setName(String(row.name ?? ''));
    setType(String(row.type ?? 'CUSTOM'));
    setContent({
      title: structured.title ?? '',
      header: structured.header ?? '',
      body: structured.body ?? '',
      footer: structured.footer ?? '',
      signature: structured.signature ?? '',
    });
    setPreview(false);
    setValidation(null);
    setFormError('');
  }

  function insertVariable(field: keyof StructuredContent, variable: string) {
    const token = `{{${variable}}}`;
    setContent((current) => ({
      ...current,
      [field]: `${current[field] ?? ''}${token}`,
    }));
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      const type = String(data.get('type') || 'CUSTOM');
      await api.post('/document-templates', {
        name: String(data.get('name') || '').trim(),
        type,
        structuredContent: {
          ...emptyContent(),
          body: String(data.get('body') || '').trim(),
        },
        allowedVariables: [...VARIABLES],
        signatureRules: type === 'CONTRACT'
          ? { requiredRoles: ['PATIENT', 'CLINIC'], minSignatures: 2, serviceProviderSigner: 'CLINIC' }
          : { requiredRoles: ['PROFESSIONAL'], minSignatures: 1 },
      });
      setCreateOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o modelo.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!editor) return;
    setBusy(true);
    setFormError('');
    try {
      await api.patch(`/document-templates/${editor.id}`, {
        name,
        type,
        structuredContent: content,
        allowedVariables: [...VARIABLES],
        signatureRules: type === 'CONTRACT'
          ? { requiredRoles: ['PATIENT', 'CLINIC'], minSignatures: 2, serviceProviderSigner: 'CLINIC' }
          : editor.signatureRules ?? { requiredRoles: ['PROFESSIONAL'], minSignatures: 1 },
      });
      load();
      setValidation('Rascunho salvo.');
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function validateTemplate() {
    if (!editor) return;
    setBusy(true);
    setFormError('');
    try {
      await saveDraft();
      const result = await api.post<{ valid?: boolean; errors?: string[] }>(
        `/document-templates/${editor.id}/validate`,
        { clinicalContent: SAMPLE },
      );
      if (result?.valid === false || (result?.errors && result.errors.length)) {
        setValidation(`Validação: ${(result.errors ?? ['conteúdo inválido']).join('; ')}`);
      } else {
        setValidation('Validação OK — pronto para publicar.');
      }
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Falha na validação.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!editor) return;
    setBusy(true);
    setFormError('');
    try {
      await validateTemplate();
      await api.post(`/document-templates/${editor.id}/publish`);
      setEditor(null);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Falha ao publicar.');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: 'publish' | 'new-version' | 'archive') {
    setBusy(true);
    setError('');
    try {
      await api.post(`/document-templates/${id}/${action}`);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Falha em ${action}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Modelos de documento"
      description="Editar rascunhos, pré-visualizar, validar e publicar. Editores especializados do paciente permanecem intactos."
      actions={<button className="button small primary" type="button" onClick={() => setCreateOpen(true)}>Novo modelo</button>}
    >
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando modelos…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhum modelo" description="Crie um rascunho e publique para uso na ficha." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => {
            const status = String(row.status ?? (row.active ? 'PUBLISHED' : 'DRAFT'));
            const isDraft = status === 'DRAFT';
            return (
              <div className="settings-row" key={String(row.id)}>
                <div>
                  <strong>{text(row.name)}</strong>
                  <span>
                    {presentationLabel(row.type)} · v{text(row.version)} · {presentationLabel(status)}
                  </span>
                </div>
                <div className="row-actions">
                  <StatusBadge tone={status === 'PUBLISHED' ? 'green' : 'gray'}>
                    {presentationLabel(status)}
                  </StatusBadge>
                  {isDraft ? (
                    <button className="button small" type="button" disabled={busy} onClick={() => openEditor(row)}>
                      Editar
                    </button>
                  ) : (
                    <button className="button small" type="button" disabled={busy} onClick={() => openEditor(row)}>
                      Visualizar
                    </button>
                  )}
                  {isDraft ? (
                    <button className="button small primary" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'publish')}>
                      Publicar
                    </button>
                  ) : null}
                  {status === 'PUBLISHED' ? (
                    <button className="button small" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'new-version')}>
                      Nova versão
                    </button>
                  ) : null}
                  <button className="button small" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'archive')}>
                    Arquivar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Novo modelo (rascunho)" description="Corpo inicial; refine no editor estruturado." onClose={() => setCreateOpen(false)} confirmOnClose>
        <form className="mutation-form" onSubmit={createTemplate}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label className="span-2">Tipo
            <select name="type" defaultValue="CUSTOM">
              {TEMPLATE_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Corpo<textarea name="body" rows={5} required minLength={5} placeholder="Solicitamos exames: …" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar rascunho'}</button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editor)}
        size="xlarge"
        title={editor ? `${text(editor.name)} · v${text(editor.version)}` : 'Editor'}
        description={String(editor?.status) === 'DRAFT' ? 'Editar rascunho' : 'Publicado — somente leitura. Use Nova versão para alterar.'}
        onClose={() => setEditor(null)}
        confirmOnClose={String(editor?.status) === 'DRAFT'}
      >
        {editor ? (
          <div className="document-template-editor">
            <div className="heading-actions">
              <button type="button" className={`button small${!preview ? ' primary' : ''}`} onClick={() => setPreview(false)}>Editar</button>
              <button type="button" className={`button small${preview ? ' primary' : ''}`} onClick={() => setPreview(true)}>Pré-visualizar</button>
            </div>
            {!preview ? (
              <div className="mutation-form">
                <label className="span-2">Nome
                  <input value={name} disabled={String(editor.status) !== 'DRAFT'} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="span-2">Tipo
                  <select value={type} disabled={String(editor.status) !== 'DRAFT'} onChange={(e) => setType(e.target.value)}>
                    {TEMPLATE_TYPE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                    {type === 'CERTIFICATE' ? <option value="CERTIFICATE">Atestado</option> : null}
                  </select>
                </label>
                {(['title', 'header', 'body', 'footer', 'signature'] as const).map((field) => (
                  <label key={field} className="span-2">
                    {presentationLabel(field)}
                    <textarea
                      rows={field === 'body' ? 6 : 2}
                      value={content[field] ?? ''}
                      disabled={String(editor.status) !== 'DRAFT'}
                      onChange={(e) => setContent((current) => ({ ...current, [field]: e.target.value }))}
                    />
                    {String(editor.status) === 'DRAFT' ? (
                      <span className="variable-inserter">
                        + Inserir variável
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) insertVariable(field, e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">Escolher…</option>
                          {VARIABLES.map((variable) => (
                            <option key={variable} value={variable}>{`{{${variable}}}`}</option>
                          ))}
                        </select>
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : (
              <div className="document-template-preview">
                <p className="muted-note">Dados fictícios seguros (sem paciente real).</p>
                <h2>{previewHtml.title || text(editor.name)}</h2>
                <p>{previewHtml.header}</p>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{previewHtml.body}</pre>
                <p>{previewHtml.footer}</p>
                <p><em>{previewHtml.signature}</em></p>
                <p>Paciente: {SAMPLE.patientName} · Profissional: {SAMPLE.professionalName} · CRO: {SAMPLE.professionalCro}</p>
              </div>
            )}
            {validation ? <p className="muted-note">{validation}</p> : null}
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            {String(editor.status) === 'DRAFT' ? (
              <div className="heading-actions">
                <button type="button" className="button soft" disabled={busy} onClick={() => void saveDraft()}>Salvar</button>
                <button type="button" className="button" disabled={busy} onClick={() => void validateTemplate()}>Validar</button>
                <button type="button" className="button primary" disabled={busy} onClick={() => void publish()}>Publicar</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </Panel>
  );
}

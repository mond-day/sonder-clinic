'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, Panel, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import * as documentApi from './document-api';

const TEMPLATE_TYPES = [
  'CERTIFICATE',
  'PRESCRIPTION',
  'EXAM_REQUEST',
  'DECLARATION',
  'CONSENT',
  'REFERRAL',
  'CUSTOM',
] as const;

/** Admin mínimo: listar, criar rascunho, publicar e nova versão. */
export function DocumentTemplatesAdminPanel() {
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    documentApi.listDocumentTemplates(true)
      .then((data) => setRows(list(data as unknown as RecordValue[])))
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao listar modelos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      await api.post('/document-templates', {
        name: String(data.get('name') || '').trim(),
        type: String(data.get('type') || 'CUSTOM'),
        structuredContent: { body: String(data.get('body') || '').trim() },
        allowedVariables: ['patientName', 'clinicName', 'professionalName', 'date'],
      });
      setOpen(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o modelo.');
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
      description="Publicar/versionar modelos (API já existente). Editor de solicitação de exame continua no workspace do paciente."
      actions={<button className="button small primary" type="button" onClick={() => setOpen(true)}>Novo modelo</button>}
    >
      {error ? <p className="state-message error" role="alert">{error}</p> : null}
      {loading ? <div className="state-message">Carregando modelos…</div> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState title="Nenhum modelo" description="Crie um rascunho e publique para uso na ficha." />
      ) : (
        <div className="settings-list">
          {rows.map((row) => (
            <div className="settings-row" key={String(row.id)}>
              <div>
                <strong>{text(row.name)}</strong>
                <span>
                  {presentationLabel(row.type)} · v{text(row.version)} · {presentationLabel(row.status ?? (row.active ? 'PUBLISHED' : 'DRAFT'))}
                </span>
              </div>
              <div className="row-actions">
                <StatusBadge tone={row.status === 'PUBLISHED' || row.active ? 'green' : 'gray'}>
                  {presentationLabel(row.status ?? (row.active ? 'PUBLISHED' : 'DRAFT'))}
                </StatusBadge>
                {String(row.status) === 'DRAFT' || (!row.status && !row.active) ? (
                  <button className="button small primary" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'publish')}>
                    Publicar
                  </button>
                ) : null}
                {String(row.status) === 'PUBLISHED' || row.active ? (
                  <button className="button small" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'new-version')}>
                    Nova versão
                  </button>
                ) : null}
                <button className="button small" type="button" disabled={busy} onClick={() => void runAction(String(row.id), 'archive')}>
                  Arquivar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} title="Novo modelo (rascunho)" description="Corpo simples; variáveis avançadas seguem no fluxo de geração." onClose={() => setOpen(false)}>
        <form className="mutation-form" onSubmit={createTemplate}>
          <label className="span-2">Nome<input name="name" minLength={2} required autoFocus /></label>
          <label className="span-2">Tipo
            <select name="type" defaultValue="EXAM_REQUEST">
              {TEMPLATE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Conteúdo<textarea name="body" rows={5} required minLength={5} placeholder="Solicitamos exames: …" /></label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar rascunho'}</button>
        </form>
      </Modal>
    </Panel>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { presentationLabel, text } from '@/lib/format';
import { generateDocumentSchema } from './document-schemas';
import type { DocumentFolder, DocumentTemplate } from './document-types';

export function DocumentEditor({
  open,
  templates,
  professionals,
  folders,
  treatments,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  templates: DocumentTemplate[];
  professionals: Professional[];
  folders: DocumentFolder[];
  treatments: Array<{ id: string; title: string; status: string }>;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: {
    templateId: string;
    professionalId?: string;
    treatmentId?: string;
    folderId?: string;
    clinicalContent: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const published = templates.filter((row) => !row.status || row.status === 'PUBLISHED');
  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [treatmentId, setTreatmentId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [corpo, setCorpo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = templates.find((row) => !row.status || row.status === 'PUBLISHED');
    setTemplateId(first?.id ?? '');
    setProfessionalId(professionals[0]?.id ?? '');
    setTreatmentId('');
    setFolderId('');
    setCorpo('');
    setObservacoes('');
    setFormError('');
  }, [open, templates, professionals]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = generateDocumentSchema.safeParse({
      templateId,
      professionalId,
      treatmentId,
      folderId,
      corpo,
      observacoes,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    setFormError('');
    await onSubmit({
      templateId: parsed.data.templateId,
      professionalId: parsed.data.professionalId || undefined,
      treatmentId: parsed.data.treatmentId || undefined,
      folderId: parsed.data.folderId || undefined,
      clinicalContent: {
        corpo: parsed.data.corpo,
        observacoes: parsed.data.observacoes || undefined,
      },
    });
  }

  return (
    <Modal
      open={open}
      title="Gerar documento a partir de modelo"
      description="O conteúdo clínico será congelado no servidor com identidade do paciente e do profissional."
      onClose={onClose}
      size="large"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Modelo
          <select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Selecione</option>
            {published.map((template) => (
              <option key={template.id} value={template.id}>
                {text(template.name)} · {presentationLabel(template.type)} · v{template.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional emissor
          <select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Sem profissional</option>
            {professionals.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}{row.croNumber ? ` · CRO ${row.croNumber}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tratamento vinculado
          <select value={treatmentId} onChange={(event) => setTreatmentId(event.target.value)}>
            <option value="">Sem tratamento específico</option>
            {treatments.map((row) => (
              <option key={row.id} value={row.id}>{text(row.title)}</option>
            ))}
          </select>
        </label>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Padrão do tipo</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{text(folder.name)}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Conteúdo do documento
          <textarea required rows={6} value={corpo} onChange={(event) => setCorpo(event.target.value)} />
        </label>
        <label className="span-2">
          Observações internas
          <textarea
            rows={3}
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Opcional — podem aparecer no conteúdo congelado conforme o modelo."
          />
        </label>
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy || !published.length}>
            {busy ? 'Gerando…' : 'Gerar documento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

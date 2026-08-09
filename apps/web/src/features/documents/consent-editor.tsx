'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { presentationLabel, text } from '@/lib/format';
import { consentSchema } from './document-schemas';
import type { DocumentFolder, DocumentTemplate } from './document-types';

export function ConsentEditor({
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
    professionalId: string;
    treatmentId?: string;
    folderId?: string;
    clinicalContent: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const consentTemplates = useMemo(
    () => templates.filter((row) => (!row.status || row.status === 'PUBLISHED')
      && ['CONSENT', 'CONSENTIMENTO'].includes(String(row.type).toUpperCase())),
    [templates],
  );
  const fallbackTemplates = useMemo(
    () => templates.filter((row) => !row.status || row.status === 'PUBLISHED'),
    [templates],
  );
  const options = consentTemplates.length ? consentTemplates : fallbackTemplates;

  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [treatmentId, setTreatmentId] = useState('');
  const [procedureSummary, setProcedureSummary] = useState('');
  const [risks, setRisks] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [patientAcknowledged, setPatientAcknowledged] = useState(false);
  const [folderId, setFolderId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplateId(options[0]?.id ?? '');
    setProfessionalId(professionals[0]?.id ?? '');
    setTreatmentId('');
    setProcedureSummary('');
    setRisks('Dor, edema, sangramento, infecção e necessidade de reintervenção.');
    setAlternatives('Acompanhamento clínico sem intervenção imediata, quando aplicável.');
    setPatientAcknowledged(false);
    setFolderId('');
    setNotes('');
    setFormError('');
  }, [open, options, professionals]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = consentSchema.safeParse({
      templateId,
      professionalId,
      treatmentId,
      procedureSummary,
      risks,
      alternatives,
      patientAcknowledged,
      notes,
      folderId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (!parsed.data.templateId) {
      setFormError('Nenhum modelo publicado disponível para termo.');
      return;
    }

    const corpo = [
      `Procedimento / finalidade: ${parsed.data.procedureSummary}`,
      `Riscos e possíveis intercorrências: ${parsed.data.risks}`,
      parsed.data.alternatives ? `Alternativas apresentadas: ${parsed.data.alternatives}` : null,
      'O paciente declara ter sido informado e ter esclarecido dúvidas antes de consentir.',
      parsed.data.notes ? `Observações: ${parsed.data.notes}` : null,
    ].filter(Boolean).join('\n\n');

    await onSubmit({
      templateId: parsed.data.templateId,
      professionalId: parsed.data.professionalId,
      treatmentId: parsed.data.treatmentId || undefined,
      folderId: parsed.data.folderId || undefined,
      clinicalContent: {
        corpo,
        tipo: 'CONSENT',
        procedureSummary: parsed.data.procedureSummary,
        risks: parsed.data.risks,
        alternatives: parsed.data.alternatives || undefined,
        patientAcknowledged: true,
        observacoes: parsed.data.notes || undefined,
      },
    });
  }

  return (
    <Modal
      open={open}
      title="Termo / consentimento"
      description="Editor dedicado — conteúdo clínico congelado com identidade no servidor."
      onClose={onClose}
      size="large"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Modelo
          <select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Selecione</option>
            {options.map((template) => (
              <option key={template.id} value={template.id}>
                {text(template.name)} · {presentationLabel(template.type)} · v{template.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional responsável
          <select required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Selecione</option>
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
              <option key={row.id} value={row.id}>{row.title} · {presentationLabel(row.status)}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Procedimento / finalidade
          <textarea required rows={3} value={procedureSummary} onChange={(event) => setProcedureSummary(event.target.value)} placeholder="Descreva o procedimento proposto." />
        </label>
        <label className="span-2">
          Riscos e intercorrências
          <textarea required rows={3} value={risks} onChange={(event) => setRisks(event.target.value)} />
        </label>
        <label className="span-2">
          Alternativas apresentadas
          <textarea rows={2} value={alternatives} onChange={(event) => setAlternatives(event.target.value)} />
        </label>
        <label className="span-2">
          Observações
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Padrão do tipo</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
        <label className="check-field span-2">
          <input
            type="checkbox"
            checked={patientAcknowledged}
            onChange={(event) => setPatientAcknowledged(event.target.checked)}
          />
          Paciente informado e ciente dos riscos/alternativas (obrigatório para emitir)
        </label>
        {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar termo'}</button>
        </div>
      </form>
    </Modal>
  );
}

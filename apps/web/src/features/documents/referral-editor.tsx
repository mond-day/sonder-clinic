'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { presentationLabel, text } from '@/lib/format';
import { referralSchema } from './document-schemas';
import type { DocumentFolder, DocumentTemplate } from './document-types';

export function ReferralEditor({
  open,
  templates,
  professionals,
  folders,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  templates: DocumentTemplate[];
  professionals: Professional[];
  folders: DocumentFolder[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: {
    templateId: string;
    professionalId: string;
    folderId?: string;
    clinicalContent: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const referralTemplates = useMemo(
    () => templates.filter((row) => (!row.status || row.status === 'PUBLISHED')
      && ['REFERRAL', 'ENCAMINHAMENTO'].includes(String(row.type).toUpperCase())),
    [templates],
  );
  const fallbackTemplates = useMemo(
    () => templates.filter((row) => !row.status || row.status === 'PUBLISHED'),
    [templates],
  );
  const options = referralTemplates.length ? referralTemplates : fallbackTemplates;

  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [clinicalReason, setClinicalReason] = useState('');
  const [urgency, setUrgency] = useState<'ROUTINE' | 'URGENT' | 'STAT'>('ROUTINE');
  const [folderId, setFolderId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplateId(options[0]?.id ?? '');
    setProfessionalId(professionals[0]?.id ?? '');
    setSpecialty('');
    setRecipientName('');
    setClinicalReason('');
    setUrgency('ROUTINE');
    setFolderId('');
    setNotes('');
    setFormError('');
  }, [open, options, professionals]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = referralSchema.safeParse({
      templateId,
      professionalId,
      specialty,
      recipientName,
      clinicalReason,
      urgency,
      notes,
      folderId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (!parsed.data.templateId) {
      setFormError('Nenhum modelo publicado disponível para encaminhamento.');
      return;
    }

    const urgencyLabel = parsed.data.urgency === 'STAT'
      ? 'imediata'
      : parsed.data.urgency === 'URGENT'
        ? 'urgente'
        : 'rotina';
    const corpo = [
      `Encaminho o paciente para avaliação${parsed.data.specialty ? ` em ${parsed.data.specialty}` : ''}${parsed.data.recipientName ? ` (Dr(a). ${parsed.data.recipientName})` : ''}.`,
      `Motivo clínico: ${parsed.data.clinicalReason}`,
      `Prioridade: ${urgencyLabel}.`,
      parsed.data.notes ? `Observações: ${parsed.data.notes}` : null,
    ].filter(Boolean).join('\n\n');

    await onSubmit({
      templateId: parsed.data.templateId,
      professionalId: parsed.data.professionalId,
      folderId: parsed.data.folderId || undefined,
      clinicalContent: {
        corpo,
        tipo: 'REFERRAL',
        specialty: parsed.data.specialty || undefined,
        recipientName: parsed.data.recipientName || undefined,
        clinicalReason: parsed.data.clinicalReason,
        urgency: parsed.data.urgency,
        observacoes: parsed.data.notes || undefined,
      },
    });
  }

  return (
    <Modal
      open={open}
      title="Encaminhamento"
      description="Editor dedicado para encaminhar a outro profissional ou especialidade."
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
          Profissional emissor
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
          Especialidade destino
          <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Ex.: Endodontia, Cirurgia" />
        </label>
        <label>
          Destinatário (opcional)
          <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nome do colega" />
        </label>
        <label>
          Prioridade
          <select value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)}>
            <option value="ROUTINE">Rotina</option>
            <option value="URGENT">Urgente</option>
            <option value="STAT">Imediata</option>
          </select>
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
        <label className="span-2">
          Motivo clínico
          <textarea required rows={4} value={clinicalReason} onChange={(event) => setClinicalReason(event.target.value)} placeholder="Queixa, achados e pedido de avaliação." />
        </label>
        <label className="span-2">
          Observações
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {(error || formError) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar encaminhamento'}</button>
        </div>
      </form>
    </Modal>
  );
}

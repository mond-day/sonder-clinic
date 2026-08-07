'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { presentationLabel, text } from '@/lib/format';
import { certificateSchema } from './document-schemas';
import type { DocumentFolder, DocumentTemplate } from './document-types';

export function CertificateEditor({
  open,
  templates,
  professionals,
  folders,
  actorId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  templates: DocumentTemplate[];
  professionals: Professional[];
  folders: DocumentFolder[];
  actorId?: string;
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
  const attestationTemplates = useMemo(
    () => templates.filter((row) => (!row.status || row.status === 'PUBLISHED')
      && String(row.type).toUpperCase() === 'ATTESTATION'),
    [templates],
  );
  const fallbackTemplates = useMemo(
    () => templates.filter((row) => !row.status || row.status === 'PUBLISHED'),
    [templates],
  );
  const options = attestationTemplates.length ? attestationTemplates : fallbackTemplates;

  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [mode, setMode] = useState<'days' | 'hours' | 'attendance'>('days');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [days, setDays] = useState(1);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:30');
  const [cid, setCid] = useState('');
  const [cidAuthorized, setCidAuthorized] = useState(false);
  const [notes, setNotes] = useState('');
  const [folderId, setFolderId] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplateId(options[0]?.id ?? '');
    setProfessionalId(professionals[0]?.id ?? '');
    setMode('days');
    setAttendanceDate(new Date().toISOString().slice(0, 10));
    setDays(1);
    setStartTime('14:00');
    setEndTime('15:30');
    setCid('');
    setCidAuthorized(false);
    setNotes('O paciente deverá permanecer afastado de suas atividades pelo período informado para recuperação adequada.');
    setFolderId('');
    setFormError('');
  }, [open, options, professionals]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = certificateSchema.safeParse({
      templateId,
      professionalId,
      mode,
      attendanceDate,
      days,
      startTime,
      endTime,
      cid,
      cidAuthorized,
      notes,
      folderId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (!parsed.data.templateId) {
      setFormError('Nenhum modelo publicado disponível para atestado.');
      return;
    }

    let corpo = '';
    if (parsed.data.mode === 'days') {
      corpo = `Atesto, para os devidos fins, que o paciente necessita permanecer afastado de suas atividades pelo período de ${parsed.data.days} dia(s), a contar de ${parsed.data.attendanceDate}.`;
    } else if (parsed.data.mode === 'hours') {
      corpo = `Declaro que o paciente compareceu para atendimento odontológico das ${parsed.data.startTime} às ${parsed.data.endTime} em ${parsed.data.attendanceDate}.`;
    } else {
      corpo = `Declaro, para os devidos fins, que o paciente compareceu à clínica em ${parsed.data.attendanceDate} para atendimento odontológico.`;
    }
    if (parsed.data.notes) corpo = `${corpo}\n\n${parsed.data.notes}`;

    const clinicalContent: Record<string, unknown> = {
      corpo,
      observacoes: parsed.data.notes || undefined,
      attendanceDate: parsed.data.attendanceDate,
      mode: parsed.data.mode,
      daysAway: parsed.data.mode === 'days' ? parsed.data.days : undefined,
      startTime: parsed.data.mode === 'hours' ? parsed.data.startTime : undefined,
      endTime: parsed.data.mode === 'hours' ? parsed.data.endTime : undefined,
    };

    if (parsed.data.cid?.trim()) {
      clinicalContent.cid = parsed.data.cid.trim();
      clinicalContent.cidConsent = {
        authorized: true,
        authorizedAt: new Date().toISOString(),
        authorizedById: actorId ?? professionalId,
        evidence: { source: 'certificate-editor', collectedAt: new Date().toISOString() },
      };
    }

    setFormError('');
    await onSubmit({
      templateId: parsed.data.templateId,
      professionalId: parsed.data.professionalId,
      folderId: parsed.data.folderId || undefined,
      clinicalContent,
    });
  }

  return (
    <Modal
      open={open}
      title="Emitir atestado ou comprovante"
      description="CID só é incluído com autorização expressa e persistida do paciente."
      onClose={onClose}
      size="medium"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Modelo
          <select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            <option value="">Selecione</option>
            {options.map((template) => (
              <option key={template.id} value={template.id}>
                {text(template.name)} · {presentationLabel(template.type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Profissional
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
          Documento
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="days">Atestado por dias</option>
            <option value="hours">Comprovante por horas</option>
            <option value="attendance">Declaração de comparecimento</option>
          </select>
        </label>
        <label>
          Data do atendimento
          <input type="date" required value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
        </label>
        {mode === 'days' ? (
          <label>
            Quantidade de dias
            <input type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </label>
        ) : null}
        {mode === 'hours' ? (
          <>
            <label>
              Hora de início
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              Hora de término
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </>
        ) : null}
        <label>
          CID (opcional)
          <input value={cid} onChange={(event) => setCid(event.target.value)} placeholder="Ex.: K04.7" />
        </label>
        <label>
          Autorização do paciente
          <select
            value={cidAuthorized ? 'yes' : 'no'}
            onChange={(event) => setCidAuthorized(event.target.value === 'yes')}
          >
            <option value="no">Não incluir CID</option>
            <option value="yes">Autorização coletada</option>
          </select>
        </label>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Atestados (padrão)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{text(folder.name)}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Complemento
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy || !options.length}>
            {busy ? 'Gerando…' : 'Gerar atestado'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

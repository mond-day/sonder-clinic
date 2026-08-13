'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { api } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { examRequestSchema } from './document-schemas';
import type { DocumentFolder, DocumentTemplate } from './document-types';

type ExamItem = {
  name: string;
  clinicalIndication: string;
  laterality: string;
  notes: string;
};

const FALLBACK_EXAM_PRESETS = [
  'Radiografia panorâmica',
  'Radiografia periapical',
  'Interproximal',
  'Tomografia Cone Beam',
  'Telerradiografia',
  'Fotografias clínicas',
  'Outro',
] as const;

const emptyItem = (name = ''): ExamItem => ({
  name,
  clinicalIndication: '',
  laterality: '',
  notes: '',
});

export function ExamRequestEditor({
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
  const examTemplates = useMemo(
    () => templates.filter((row) => (!row.status || row.status === 'PUBLISHED')
      && String(row.type).toUpperCase() === 'EXAM_REQUEST'),
    [templates],
  );
  const fallbackTemplates = useMemo(
    () => templates.filter((row) => !row.status || row.status === 'PUBLISHED'),
    [templates],
  );
  const options = examTemplates.length ? examTemplates : fallbackTemplates;

  const [templateId, setTemplateId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [clinicalQuestion, setClinicalQuestion] = useState('');
  const [urgency, setUrgency] = useState<'ROUTINE' | 'URGENT' | 'STAT'>('ROUTINE');
  const [items, setItems] = useState<ExamItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [examCatalog, setExamCatalog] = useState<Array<RecordValue & { name: string }>>([]);
  const [examSearch, setExamSearch] = useState('');
  const [folderId, setFolderId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplateId(options[0]?.id ?? '');
    setProfessionalId(professionals[0]?.id ?? '');
    setClinicalQuestion('');
    setUrgency('ROUTINE');
    setItems([]);
    setPickerOpen(false);
    setExamSearch('');
    setFolderId('');
    setNotes('');
    setFormError('');
    api.get<Array<RecordValue & { name: string }>>('/exam-catalog')
      .then((data) => setExamCatalog(list(data) as Array<RecordValue & { name: string }>))
      .catch(() => setExamCatalog([]));
  }, [open, options, professionals]);

  const pickerOptions = useMemo(() => {
    const names = examCatalog.length
      ? examCatalog.map((row) => text(row.name)).filter(Boolean)
      : [...FALLBACK_EXAM_PRESETS.filter((item) => item !== 'Outro')];
    const q = examSearch.trim().toLowerCase();
    const filtered = q ? names.filter((name) => name.toLowerCase().includes(q)) : names;
    return [...filtered, 'Outro / texto livre'];
  }, [examCatalog, examSearch]);

  function updateItem(index: number, patch: Partial<ExamItem>) {
    setItems((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addExam(preset: string) {
    const name = preset.startsWith('Outro') ? '' : preset;
    const catalog = examCatalog.find((row) => text(row.name) === preset);
    setItems((current) => [...current, {
      ...emptyItem(name),
      notes: catalog?.defaultInstructions ? text(catalog.defaultInstructions) : '',
    }]);
    setPickerOpen(false);
    setExamSearch('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = examRequestSchema.safeParse({
      templateId,
      professionalId,
      clinicalQuestion,
      urgency,
      items: items.map((row) => ({
        name: row.name,
        clinicalIndication: row.clinicalIndication || undefined,
        laterality: row.laterality || undefined,
        notes: row.notes || undefined,
      })),
      notes: notes || undefined,
      folderId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (!parsed.data.templateId) {
      setFormError('Nenhum modelo publicado disponível para solicitação de exame.');
      return;
    }

    const urgencyLabel = {
      ROUTINE: 'rotina',
      URGENT: 'urgente',
      STAT: 'imediato (STAT)',
    }[parsed.data.urgency];

    const examLines = parsed.data.items.map((item, index) => {
      const bits = [
        `${index + 1}. ${item.name}`,
        item.laterality ? `lateralidade: ${item.laterality}` : null,
        item.clinicalIndication ? `indicação: ${item.clinicalIndication}` : null,
        item.notes ? `obs.: ${item.notes}` : null,
      ].filter(Boolean);
      return bits.join(' — ');
    });

    const corpo = [
      `Solicito os exames abaixo (${urgencyLabel}).`,
      parsed.data.clinicalQuestion ? `Hipótese / questão clínica: ${parsed.data.clinicalQuestion}` : null,
      '',
      ...examLines,
      parsed.data.notes ? `\nObservações: ${parsed.data.notes}` : null,
    ].filter((line) => line !== null).join('\n');

    setFormError('');
    await onSubmit({
      templateId: parsed.data.templateId,
      professionalId: parsed.data.professionalId,
      folderId: parsed.data.folderId || undefined,
      clinicalContent: {
        corpo,
        observacoes: parsed.data.notes || undefined,
        clinicalQuestion: parsed.data.clinicalQuestion || undefined,
        urgency: parsed.data.urgency,
        exams: parsed.data.items,
      },
    });
  }

  return (
    <Modal
      open={open}
      title="Solicitação de exame"
      description="Liste exames, indicação clínica e urgência a partir do catálogo da clínica."
      onClose={onClose}
      size="medium"
      confirmOnClose
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
          Urgência
          <select value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)}>
            <option value="ROUTINE">Rotina</option>
            <option value="URGENT">Urgente</option>
            <option value="STAT">Imediato (STAT)</option>
          </select>
        </label>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Exames (padrão)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{text(folder.name)}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Hipótese / questão clínica
          <textarea
            rows={2}
            value={clinicalQuestion}
            onChange={(event) => setClinicalQuestion(event.target.value)}
            placeholder="Ex.: Avaliar extensão de lesão periapical no 26"
          />
        </label>

        <div className="span-2" style={{ display: 'grid', gap: 10 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Exames solicitados</strong>
            <button
              type="button"
              className="button small"
              onClick={() => setPickerOpen((current) => !current)}
            >
              + Adicionar exame
            </button>
          </header>
          {items.length === 0 ? (
            <p className="muted-note">Nenhum exame adicionado.</p>
          ) : null}
          {pickerOpen ? (
            <div className="exam-picker-grid" role="listbox" aria-label="Tipos de exame">
              <input
                className="filter-input"
                placeholder="Buscar exame…"
                value={examSearch}
                onChange={(event) => setExamSearch(event.target.value)}
                aria-label="Buscar exame"
              />
              {pickerOptions.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="button"
                  onClick={() => addExam(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          ) : null}
          {items.map((item, index) => (
            <div key={index} className="mutation-form" style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: 10 }}>
              <label className="span-2">
                Nome do exame
                <input
                  required
                  value={item.name}
                  onChange={(event) => updateItem(index, { name: event.target.value })}
                  placeholder="Ex.: Tomografia cone beam maxila"
                  autoFocus={!item.name}
                />
              </label>
              <label>
                Lateralidade
                <input
                  value={item.laterality}
                  onChange={(event) => updateItem(index, { laterality: event.target.value })}
                  placeholder="Esq. / Dir. / Bilateral"
                />
              </label>
              <label>
                Indicação
                <input
                  value={item.clinicalIndication}
                  onChange={(event) => updateItem(index, { clinicalIndication: event.target.value })}
                />
              </label>
              <label className="span-2">
                Observação do item
                <input
                  value={item.notes}
                  onChange={(event) => updateItem(index, { notes: event.target.value })}
                />
              </label>
              <button
                type="button"
                className="button small"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                Remover
              </button>
            </div>
          ))}
        </div>

        <label className="span-2">
          Observações gerais
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy || !options.length || items.length === 0}>
            {busy ? 'Gerando…' : 'Gerar solicitação'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

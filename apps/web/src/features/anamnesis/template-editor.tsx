'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, Panel, StatusBadge } from '@/components/ui';

type Question = {
  id: string;
  code: string;
  label: string;
  helpText?: string;
  type: string;
  required: boolean;
  order: number;
  options?: Array<{ value: string; label: string }>;
  details?: { enabled: boolean; label: string; type: 'SHORT_TEXT' | 'LONG_TEXT' | 'REPEATER_MEDICATION'; requiredWhenVisible?: boolean };
};

type Section = {
  id: string;
  code: string;
  title: string;
  description?: string;
  order: number;
  questions: Question[];
};

type Schema = {
  schemaVersion: 1;
  title: string;
  audience: 'ADULT' | 'CHILD' | 'ELDERLY' | 'PREGNANT' | 'CUSTOM';
  sections: Section[];
  riskRules: unknown[];
  completionRules: unknown[];
};

type Template = RecordValue & {
  id: string;
  name: string;
  description?: string;
  audience: Schema['audience'];
  status: string;
  version: number;
  validityMonths?: number;
  schemaJson: Schema;
};

const QUESTION_TYPES = [
  'YES_NO', 'YES_NO_UNKNOWN', 'YES_NO_DETAILS', 'SHORT_TEXT', 'LONG_TEXT',
  'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'NUMBER', 'DATE', 'RISK_LEVEL', 'ACKNOWLEDGEMENT',
] as const;

const AUDIENCES = [
  { value: 'ADULT', label: 'Adulto' },
  { value: 'CHILD', label: 'Infantil' },
  { value: 'ELDERLY', label: 'Idoso' },
  { value: 'PREGNANT', label: 'Gestante' },
  { value: 'CUSTOM', label: 'Personalizado' },
] as const;

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function emptySchema(audience: Schema['audience'] = 'CUSTOM'): Schema {
  return {
    schemaVersion: 1,
    title: 'Novo modelo',
    audience,
    sections: [{
      id: uid('sec'),
      code: 'SEC_1',
      title: 'Identificação',
      description: 'Seção inicial do formulário',
      order: 1,
      questions: [{
        id: uid('q'),
        code: 'Q_01',
        label: 'Queixa principal',
        type: 'LONG_TEXT',
        required: true,
        order: 1,
      }],
    }],
    riskRules: [],
    completionRules: [],
  };
}

function normalizeOrders(sections: Section[]): Section[] {
  return sections.map((section, sectionIndex) => ({
    ...section,
    order: sectionIndex + 1,
    questions: section.questions.map((question, questionIndex) => ({
      ...question,
      order: questionIndex + 1,
    })),
  }));
}

function statusTone(status: string) {
  if (status === 'PUBLISHED') return 'green' as const;
  if (status === 'DRAFT') return 'amber' as const;
  return 'gray' as const;
}

export function AnamnesisTemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dragQuestionId, setDragQuestionId] = useState<string | null>(null);
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = list(await api.get<Template[]>('/anamnesis/templates?includeArchived=true')) as Template[];
      setTemplates(rows);
      if (selectedId) {
        const current = rows.find((item) => item.id === selectedId);
        if (current) {
          setDraft(current);
          setSectionId(current.schemaJson.sections[0]?.id ?? null);
        }
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar modelos.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, [load]);

  const sections = useMemo(
    () => normalizeOrders(draft?.schemaJson.sections ?? []),
    [draft],
  );
  const activeSection = sections.find((item) => item.id === sectionId) ?? sections[0];
  const readOnly = Boolean(draft && draft.status !== 'DRAFT');

  function selectTemplate(template: Template) {
    setSelectedId(template.id);
    setDraft(template);
    setSectionId(template.schemaJson.sections[0]?.id ?? null);
    setMessage('');
    setError('');
  }

  function updateSchema(mutator: (schema: Schema) => Schema) {
    if (!draft || readOnly) return;
    setDraft({
      ...draft,
      schemaJson: mutator({
        ...draft.schemaJson,
        sections: normalizeOrders(draft.schemaJson.sections),
      }),
    });
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const audience = String(data.get('audience') || 'CUSTOM') as Schema['audience'];
      const schema = emptySchema(audience);
      schema.title = String(data.get('name') || 'Novo modelo');
      const created = await api.post<Template>('/anamnesis/templates', {
        name: schema.title,
        description: String(data.get('description') || ''),
        audience,
        schemaJson: schema,
        validityMonths: Number(data.get('validityMonths') || 6),
      });
      setMessage('Modelo rascunho criado.');
      selectTemplate(created);
      await load();
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o modelo.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft || readOnly) return;
    setBusy(true);
    setError('');
    try {
      const schema = {
        ...draft.schemaJson,
        title: draft.name,
        audience: draft.audience,
        sections: normalizeOrders(draft.schemaJson.sections),
      };
      const updated = await api.patch<Template>(`/anamnesis/templates/${draft.id}`, {
        name: draft.name,
        description: draft.description,
        audience: draft.audience,
        validityMonths: draft.validityMonths ?? 6,
        schemaJson: schema,
      });
      setDraft(updated);
      setMessage('Rascunho salvo.');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar rascunho.');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(path: string, success: string) {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.post<Template>(path);
      setMessage(success);
      selectTemplate(updated);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Ação não concluída.');
    } finally {
      setBusy(false);
    }
  }

  function moveQuestion(fromId: string, toId: string) {
    if (!activeSection || fromId === toId || readOnly) return;
    updateSchema((schema) => ({
      ...schema,
      sections: schema.sections.map((section) => {
        if (section.id !== activeSection.id) return section;
        const questions = [...section.questions];
        const from = questions.findIndex((item) => item.id === fromId);
        const to = questions.findIndex((item) => item.id === toId);
        if (from < 0 || to < 0) return section;
        const [item] = questions.splice(from, 1);
        questions.splice(to, 0, item!);
        return { ...section, questions };
      }),
    }));
  }

  function moveSection(fromId: string, toId: string) {
    if (fromId === toId || readOnly) return;
    updateSchema((schema) => {
      const next = [...schema.sections];
      const from = next.findIndex((item) => item.id === fromId);
      const to = next.findIndex((item) => item.id === toId);
      if (from < 0 || to < 0) return schema;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return { ...schema, sections: next };
    });
  }

  return (
    <div className="anamnesis-editor">
      <Panel
        title="Modelos de anamnese"
        description="Editor visual com seções, perguntas, reordenação e publicação. Versões publicadas são imutáveis."
        actions={(
          <button type="button" className="button soft small" disabled={busy || loading} onClick={() => void load()}>
            Atualizar
          </button>
        )}
      >
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="muted-note">{message}</p> : null}
        <div className="anamnesis-editor-layout">
          <aside className="anamnesis-template-list">
            <form className="mutation-form compact" onSubmit={createTemplate}>
              <label>Nome<input name="name" minLength={2} required placeholder="Modelo personalizado" /></label>
              <label>Público
                <select name="audience" defaultValue="CUSTOM">
                  {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>Validade (meses)<input name="validityMonths" type="number" min={1} max={36} defaultValue={6} /></label>
              <label className="span-2">Descrição<input name="description" placeholder="Opcional" /></label>
              <button className="button primary" disabled={busy}>＋ Novo rascunho</button>
            </form>
            {loading ? <div className="state-message">Carregando modelos…</div> : null}
            {!loading && templates.length === 0 ? <EmptyState title="Nenhum modelo" description="Crie o primeiro rascunho." /> : null}
            <div className="template-stack">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`template-card ${selectedId === template.id ? 'active' : ''}`}
                  onClick={() => selectTemplate(template)}
                >
                  <strong>{text(template.name)}</strong>
                  <span>{AUDIENCES.find((item) => item.value === template.audience)?.label ?? template.audience} · v{template.version}</span>
                  <div className="template-meta">
                    <StatusBadge tone={statusTone(template.status)}>{presentationLabel(template.status)}</StatusBadge>
                    <span className="badge">{template.schemaJson?.sections?.length ?? 0} seções</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="anamnesis-workspace editor-mode">
            {!draft ? (
              <EmptyState title="Selecione um modelo" description="Edite rascunhos ou crie nova versão a partir de publicados." />
            ) : (
              <>
                <header className="clinical-form-head">
                  <div>
                    <h2>{draft.name} · versão {draft.version}</h2>
                    <p>{readOnly ? 'Publicado/arquivado: somente leitura. Crie nova versão para editar.' : 'Arraste seções e perguntas para reordenar. Salve antes de publicar.'}</p>
                  </div>
                  <div className="toolbar">
                    <StatusBadge tone={statusTone(draft.status)}>{presentationLabel(draft.status)}</StatusBadge>
                    {!readOnly ? <button type="button" className="button primary small" disabled={busy} onClick={() => void saveDraft()}>Salvar rascunho</button> : null}
                    {draft.status === 'DRAFT' ? (
                      <button type="button" className="button small" disabled={busy} onClick={() => void runAction(`/anamnesis/templates/${draft.id}/publish`, 'Modelo publicado.')}>Publicar</button>
                    ) : null}
                    {draft.status === 'PUBLISHED' ? (
                      <button type="button" className="button primary small" disabled={busy} onClick={() => void runAction(`/anamnesis/templates/${draft.id}/new-version`, 'Nova versão rascunho criada.')}>Nova versão</button>
                    ) : null}
                    <button type="button" className="button soft small" disabled={busy} onClick={() => void runAction(`/anamnesis/templates/${draft.id}/duplicate`, 'Cópia criada.')}>Duplicar</button>
                    {draft.status !== 'ARCHIVED' ? (
                      <button type="button" className="button soft small" disabled={busy} onClick={() => void runAction(`/anamnesis/templates/${draft.id}/archive`, 'Modelo arquivado.')}>Arquivar</button>
                    ) : null}
                  </div>
                </header>

                <div className="editor-meta mutation-form compact">
                  <label>Nome<input value={draft.name} disabled={readOnly} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label>Público
                    <select
                      value={draft.audience}
                      disabled={readOnly}
                      onChange={(event) => setDraft({ ...draft, audience: event.target.value as Schema['audience'] })}
                    >
                      {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>Validade
                    <input
                      type="number"
                      min={1}
                      max={36}
                      disabled={readOnly}
                      value={draft.validityMonths ?? 6}
                      onChange={(event) => setDraft({ ...draft, validityMonths: Number(event.target.value) })}
                    />
                  </label>
                  <label className="span-2">Descrição
                    <input
                      value={draft.description ?? ''}
                      disabled={readOnly}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>
                </div>

                <div className="anamnesis-builder">
                  <aside className="section-rail">
                    <small>Seções</small>
                    <nav className="section-nav">
                      {sections.map((section, index) => (
                        <button
                          key={section.id}
                          type="button"
                          draggable={!readOnly}
                          className={activeSection?.id === section.id ? 'active' : ''}
                          onClick={() => setSectionId(section.id)}
                          onDragStart={() => setDragSectionId(section.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (dragSectionId) moveSection(dragSectionId, section.id);
                            setDragSectionId(null);
                          }}
                        >
                          <span className="section-number">{index + 1}</span>
                          {section.title}
                        </button>
                      ))}
                    </nav>
                    {!readOnly ? (
                      <button
                        type="button"
                        className="button soft small wide"
                        onClick={() => updateSchema((schema) => ({
                          ...schema,
                          sections: [...schema.sections, {
                            id: uid('sec'),
                            code: `SEC_${schema.sections.length + 1}`,
                            title: `Nova seção ${schema.sections.length + 1}`,
                            description: '',
                            order: schema.sections.length + 1,
                            questions: [{
                              id: uid('q'),
                              code: `Q_${Date.now().toString().slice(-4)}`,
                              label: 'Nova pergunta',
                              type: 'YES_NO',
                              required: false,
                              order: 1,
                              options: [
                                { value: 'yes', label: 'Sim' },
                                { value: 'no', label: 'Não' },
                              ],
                            }],
                          }],
                        }))}
                      >
                        ＋ Seção
                      </button>
                    ) : null}
                  </aside>

                  <article className="clinical-form-card">
                    {!activeSection ? <EmptyState title="Sem seções" /> : (
                      <>
                        <div className="clinical-section-title">
                          <span className="section-number">{activeSection.order}</span>
                          <div className="mutation-form compact" style={{ flex: 1 }}>
                            <label>Título da seção
                              <input
                                value={activeSection.title}
                                disabled={readOnly}
                                onChange={(event) => updateSchema((schema) => ({
                                  ...schema,
                                  sections: schema.sections.map((section) => (
                                    section.id === activeSection.id
                                      ? { ...section, title: event.target.value }
                                      : section
                                  )),
                                }))}
                              />
                            </label>
                            <label className="span-2">Descrição
                              <input
                                value={activeSection.description ?? ''}
                                disabled={readOnly}
                                onChange={(event) => updateSchema((schema) => ({
                                  ...schema,
                                  sections: schema.sections.map((section) => (
                                    section.id === activeSection.id
                                      ? { ...section, description: event.target.value }
                                      : section
                                  )),
                                }))}
                              />
                            </label>
                          </div>
                        </div>

                        <div className="question-builder-list">
                          {activeSection.questions.map((question) => (
                            <div
                              key={question.id}
                              className="question-group builder-item"
                              draggable={!readOnly}
                              onDragStart={() => setDragQuestionId(question.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                if (dragQuestionId) moveQuestion(dragQuestionId, question.id);
                                setDragQuestionId(null);
                              }}
                            >
                              <div className="question-head">
                                <strong>{readOnly ? '⠿' : '⠿ arraste'} · {question.code}</strong>
                                {!readOnly ? (
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => updateSchema((schema) => ({
                                      ...schema,
                                      sections: schema.sections.map((section) => (
                                        section.id === activeSection.id
                                          ? { ...section, questions: section.questions.filter((item) => item.id !== question.id) }
                                          : section
                                      )).filter((section) => section.questions.length > 0),
                                    }))}
                                  >
                                    Remover
                                  </button>
                                ) : null}
                              </div>
                              <div className="mutation-form compact">
                                <label>Pergunta
                                  <input
                                    value={question.label}
                                    disabled={readOnly}
                                    onChange={(event) => updateSchema((schema) => ({
                                      ...schema,
                                      sections: schema.sections.map((section) => (
                                        section.id === activeSection.id
                                          ? {
                                              ...section,
                                              questions: section.questions.map((item) => (
                                                item.id === question.id ? { ...item, label: event.target.value } : item
                                              )),
                                            }
                                          : section
                                      )),
                                    }))}
                                  />
                                </label>
                                <label>Tipo
                                  <select
                                    value={question.type}
                                    disabled={readOnly}
                                    onChange={(event) => updateSchema((schema) => ({
                                      ...schema,
                                      sections: schema.sections.map((section) => (
                                        section.id === activeSection.id
                                          ? {
                                              ...section,
                                              questions: section.questions.map((item) => (
                                                item.id === question.id ? { ...item, type: event.target.value } : item
                                              )),
                                            }
                                          : section
                                      )),
                                    }))}
                                  >
                                    {QUESTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                  </select>
                                </label>
                                <label className="checkbox-row">
                                  <input
                                    type="checkbox"
                                    checked={question.required}
                                    disabled={readOnly}
                                    onChange={(event) => updateSchema((schema) => ({
                                      ...schema,
                                      sections: schema.sections.map((section) => (
                                        section.id === activeSection.id
                                          ? {
                                              ...section,
                                              questions: section.questions.map((item) => (
                                                item.id === question.id ? { ...item, required: event.target.checked } : item
                                              )),
                                            }
                                          : section
                                      )),
                                    }))}
                                  />
                                  Obrigatória
                                </label>
                                <label className="span-2">Ajuda
                                  <input
                                    value={question.helpText ?? ''}
                                    disabled={readOnly}
                                    onChange={(event) => updateSchema((schema) => ({
                                      ...schema,
                                      sections: schema.sections.map((section) => (
                                        section.id === activeSection.id
                                          ? {
                                              ...section,
                                              questions: section.questions.map((item) => (
                                                item.id === question.id ? { ...item, helpText: event.target.value } : item
                                              )),
                                            }
                                          : section
                                      )),
                                    }))}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>

                        {!readOnly ? (
                          <button
                            type="button"
                            className="button soft"
                            onClick={() => updateSchema((schema) => ({
                              ...schema,
                              sections: schema.sections.map((section) => (
                                section.id === activeSection.id
                                  ? {
                                      ...section,
                                      questions: [...section.questions, {
                                        id: uid('q'),
                                        code: `Q_${Date.now().toString().slice(-4)}`,
                                        label: 'Nova pergunta',
                                        type: 'YES_NO',
                                        required: false,
                                        order: section.questions.length + 1,
                                        options: [
                                          { value: 'yes', label: 'Sim' },
                                          { value: 'no', label: 'Não' },
                                        ],
                                      }],
                                    }
                                  : section
                              )),
                            }))}
                          >
                            ＋ Pergunta
                          </button>
                        ) : null}
                      </>
                    )}
                  </article>
                </div>
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

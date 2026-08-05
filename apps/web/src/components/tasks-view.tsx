'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { initials, list, nested, text, type RecordValue } from '@/lib/format';
import { useAuth } from './auth-provider';
import { useSelection } from './selection-provider';
import { useWorkspace } from './workspace-provider';
import { Modal } from './modal';
import { Disclosure, PageHeader, Panel } from './ui';
import { SearchableSelect } from './searchable-select';

type Status = 'INBOX' | 'TODAY' | 'UPCOMING' | 'DONE';

const columns: Array<{ key: Status; label: string }> = [
  { key: 'INBOX', label: 'Entrada' },
  { key: 'TODAY', label: 'Hoje' },
  { key: 'UPCOMING', label: 'Próximas' },
  { key: 'DONE', label: 'Concluídas' },
];

const categoryLabels: Record<string, string> = {
  PATIENT: 'Paciente',
  FINANCE: 'Financeiro',
  LAB: 'Laboratório',
  SCHEDULE: 'Agenda',
  STOCK: 'Estoque',
  ADMIN: 'Administrativo',
};

const priorityTone: Record<string, string> = { HIGH: 'red', NORMAL: '', LOW: 'green' };

const createSchema = z.object({
  title: z.string().trim().min(3, 'Descreva a tarefa.'),
  description: z.string().trim().optional(),
  category: z.enum(['PATIENT', 'FINANCE', 'LAB', 'SCHEDULE', 'STOCK', 'ADMIN']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']),
  status: z.enum(['INBOX', 'TODAY', 'UPCOMING', 'DONE']),
  dueAt: z.string().datetime().optional(),
  patientId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});

function dueLabel(value: unknown, status: string) {
  if (status === 'DONE') return { label: 'Concluída', late: false };
  if (!value) return { label: 'Sem prazo', late: false };
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return { label: 'Sem prazo', late: false };
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (days < 0) return { label: `Atrasada · ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date)}`, late: true };
  if (days === 0) return { label: `Hoje, ${time}`, late: date.getTime() < now.getTime() };
  if (days === 1) return { label: `Amanhã, ${time}`, late: false };
  return {
    label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(date),
    late: false,
  };
}

export function TasksView() {
  const { user } = useAuth();
  const { clinicId, professionals } = useSelection();
  const { refresh: refreshWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<RecordValue | null>(null);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>(`/tasks?clinicId=${clinicId}`),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextTasks, nextPatients]) => {
        setTasks(list(nextTasks));
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar as tarefas.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  const visible = useMemo(() => tasks.filter((item) => {
    if (onlyMine && String(nested(item, 'assignee').id ?? '') !== user?.id) return false;
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (priorityFilter && item.priority !== priorityFilter) return false;
    return true;
  }), [tasks, onlyMine, categoryFilter, priorityFilter, user?.id]);

  const grouped = useMemo(() => {
    const map: Record<Status, RecordValue[]> = { INBOX: [], TODAY: [], UPCOMING: [], DONE: [] };
    visible.forEach((item) => {
      const status = String(item.status) as Status;
      if (map[status]) map[status].push(item);
    });
    return map;
  }, [visible]);

  async function move(id: string, status: Status, success: string) {
    setBusy(true);
    setFormError('');
    try {
      await api.patch(`/tasks/${id}`, { status });
      setFormMessage(success);
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível mover a tarefa.');
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDue = String(data.get('dueAt') ?? '');
    const parsed = createSchema.safeParse({
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? '').trim() || undefined,
      category: String(data.get('category') ?? 'ADMIN'),
      priority: String(data.get('priority') ?? 'NORMAL'),
      status: String(data.get('status') ?? 'INBOX'),
      dueAt: rawDue ? new Date(rawDue).toISOString() : undefined,
      patientId: String(data.get('patientId') ?? '') || undefined,
      assigneeId: String(data.get('assigneeId') ?? '') || undefined,
    });
    if (!parsed.success) {
      setFormMessage('');
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      if (selectedTask) {
        await api.patch(`/tasks/${String(selectedTask.id)}`, parsed.data);
      } else {
        await api.post('/tasks', { ...parsed.data, clinicId });
      }
      setFormMessage(selectedTask ? 'Tarefa atualizada.' : 'Tarefa criada.');
      form.reset();
      setFormOpen(false);
      setSelectedTask(null);
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a tarefa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tarefas e alertas"
        description="Atividades da equipe vinculadas a pacientes, financeiro, agenda e laboratório."
        actions={
          <>
            <button
              className={`button ${onlyMine ? 'soft' : ''}`.trim()}
              type="button"
              aria-pressed={onlyMine}
              onClick={() => setOnlyMine((value) => !value)}
            >Minhas tarefas</button>
            <button
              className="button"
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal size={15} />Filtros
            </button>
            <button className="button secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={15} />Atualizar
            </button>
            <button
              className="button primary"
              type="button"
              aria-expanded={formOpen}
              onClick={() => { setSelectedTask(null); setFormOpen(true); setFormMessage(''); }}
            >
              <Plus size={15} />Nova tarefa
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <Modal
        open={formOpen}
        title={selectedTask ? 'Detalhes da tarefa' : 'Nova tarefa'}
        description="Edite os campos reais e salve sem perder o contexto do quadro."
        onClose={() => { setFormOpen(false); setSelectedTask(null); setFormError(''); }}
      >
          <form className="mutation-form" key={String(selectedTask?.id ?? 'new')} onSubmit={save}>
            <Disclosure title="Informações principais" description="Defina o objetivo e a classificação">
              <label className="span-2">Título<input name="title" defaultValue={text(selectedTask?.title, '')} placeholder="Cobrar prazo da coroa" required /></label>
              <SearchableSelect name="category" label="Categoria" defaultValue={text(selectedTask?.category, 'PATIENT')} options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))} />
              <SearchableSelect name="priority" label="Prioridade" defaultValue={text(selectedTask?.priority, 'NORMAL')} options={[{ value: 'HIGH', label: 'Alta' }, { value: 'NORMAL', label: 'Normal' }, { value: 'LOW', label: 'Baixa' }]} />
            </Disclosure>
            <Disclosure title="Vínculos e prazo" description="Associe paciente, responsável e posição no quadro">
              <SearchableSelect name="status" label="Coluna" defaultValue={text(selectedTask?.status, 'INBOX')} options={columns.map(({ key, label }) => ({ value: key, label }))} />
              <label>Prazo<input name="dueAt" type="datetime-local" defaultValue={selectedTask?.dueAt ? new Date(String(selectedTask.dueAt)).toISOString().slice(0, 16) : ''} /></label>
              <SearchableSelect name="assigneeId" label="Responsável" defaultValue={text(selectedTask?.assigneeId, '')} placeholder="Sem responsável" options={professionals.map((item) => ({ value: item.userId, label: item.name }))} />
              <SearchableSelect name="patientId" label="Paciente vinculado" defaultValue={text(selectedTask?.patientId, '')} placeholder="Sem paciente" options={patients.map((item) => ({ value: String(item.id), label: text(item.fullName) }))} />
            </Disclosure>
            <Disclosure title="Detalhes" defaultOpen={false}>
              <label className="span-2">Descrição<textarea name="description" defaultValue={text(selectedTask?.description, '')} placeholder="Contexto para quem for executar" /></label>
            </Disclosure>
            <button className="button primary" disabled={busy}>{selectedTask ? 'Salvar alterações' : 'Criar tarefa'}</button>
          </form>
          {formMessage && <p className="form-success" role="status">{formMessage}</p>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
      </Modal>
      {filtersOpen && (
        <Panel>
          <div className="filters">
            <select
              className="filter-select"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              aria-label="Filtrar por prioridade"
            >
              <option value="">Todas as prioridades</option>
              <option value="HIGH">Alta</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Baixa</option>
            </select>
            <button
              className="button"
              type="button"
              onClick={() => { setCategoryFilter(''); setPriorityFilter(''); setOnlyMine(false); }}
            >Limpar filtros</button>
          </div>
        </Panel>
      )}
      {loading && <div className="state-message">Carregando tarefas…</div>}
      {!loading && (
        <div className="task-board">
          {columns.map(({ key, label }, columnIndex) => {
            const previousColumn = columnIndex > 0 ? columns[columnIndex - 1] : undefined;
            const nextColumn = columns[columnIndex + 1];
            const items = grouped[key];
            return (
            <section className="task-column" key={key} aria-label={label}>
              <div className="task-column-head">
                <h3>{label}</h3>
                <span>{items.length}</span>
              </div>
              <div className="task-list">
                {items.length === 0 && (
                  <p className="muted-note" style={{ margin: 0, textAlign: 'center', padding: '12px 0' }}>
                    Nenhuma tarefa
                  </p>
                )}
                {items.map((item) => {
                  const assignee = nested(item, 'assignee');
                  const patient = nested(item, 'patient');
                  const due = dueLabel(item.dueAt, key);
                  const tone = priorityTone[String(item.priority)] ?? '';
                  return (
                    <article className={`task-card ${key === 'DONE' ? 'done' : ''}`.trim()} key={String(item.id)}>
                      <button
                        className="card-trigger"
                        type="button"
                        onClick={() => { setSelectedTask(item); setFormOpen(true); setFormMessage(''); }}
                        aria-label={`Abrir detalhes da tarefa ${text(item.title)}`}
                      >
                      <div className="task-top">
                        <i className={`priority ${tone}`.trim()} aria-hidden />
                        <small>
                          {categoryLabels[String(item.category)] ?? text(item.category)}
                          {patient.fullName ? ` · ${text(patient.fullName)}` : ''}
                        </small>
                      </div>
                      <h4>{text(item.title)}</h4>
                      {item.description ? <p>{text(item.description)}</p> : null}
                      <div className="task-foot">
                        <span className="avatar" title={text(assignee.name, 'Sem responsável')}>
                          {assignee.name ? initials(assignee.name) : '—'}
                        </span>
                        <span className={`task-due ${due.late ? 'late' : ''}`.trim()}>{due.label}</span>
                      </div>
                      </button>
                      <div className="task-foot">
                        {previousColumn && (
                          <button
                            className="button small"
                            type="button"
                            disabled={busy}
                            aria-label={`Mover para ${previousColumn.label}`}
                            onClick={() => void move(String(item.id), previousColumn.key, 'Tarefa movida.')}
                          >
                            <ChevronLeft size={13} />
                          </button>
                        )}
                        {nextColumn && (
                          <button
                            className="button small primary"
                            type="button"
                            disabled={busy}
                            style={{ marginLeft: 'auto' }}
                            aria-label={`Mover para ${nextColumn.label}`}
                            onClick={() => void move(String(item.id), nextColumn.key, 'Tarefa movida.')}
                          >
                            {nextColumn.key === 'DONE' ? 'Concluir' : <ChevronRight size={13} />}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>
      )}
    </>
  );
}

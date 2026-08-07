'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { APPOINTMENT_DURATIONS, nearestDurationMinutes } from '@/lib/duration';
import { list, nested, statusTone, text, timeOnly, type RecordValue } from '@/lib/format';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';
import { MultiSelect } from './multi-select';
import { SearchableSelect } from './searchable-select';

type Mode = 'day' | 'week' | 'chairs';

const eventTones = ['teal', 'blue', 'amber', 'purple', 'green'] as const;
const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  CHECKED_IN: 'Na clínica',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Falta',
};

function startOfDay(reference: Date) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Segunda-feira da semana de referência (semana operacional seg–sex). */
function startOfWeek(reference: Date) {
  const date = startOfDay(reference);
  const weekday = date.getDay();
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return date;
}

function addDays(reference: Date, days: number) {
  const date = new Date(reference);
  date.setDate(date.getDate() + days);
  return date;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const longDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function AgendaView() {
  const searchParams = useSearchParams();
  const queryPatientId = searchParams.get('patientId') ?? '';
  const { clinicId, clinics, professionals } = useSelection();
  const clinic = clinics.find((item) => item.id === clinicId);
  const units = clinic?.units ?? [];

  const [mode, setMode] = useState<Mode>('week');
  const [reference, setReference] = useState(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [tags, setTags] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<RecordValue | null>(null);
  const [editingAppointment, setEditingAppointment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [professionalFilter, setProfessionalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(reference);
      return { from, to: addDays(from, 5) };
    }
    const from = startOfDay(reference);
    return { from, to: addDays(from, 1) };
  }, [mode, reference]);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      clinicId,
    });
    Promise.all([
      api.get<RecordValue[]>(`/appointments?${query}`),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/settings/agenda-tags?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextAppointments, nextPatients, nextTags]) => {
        setAppointments(list(nextAppointments));
        setPatients(list(nextPatients));
        setTags(list(nextTags));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar a agenda.'))
      .finally(() => setLoading(false));
  }, [clinicId, range.from, range.to]);

  useEffect(load, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1' || searchParams.get('patientId')) {
      setFormOpen(true);
    }
  }, [searchParams]);

  const toneByProfessional = useMemo(() => {
    const map = new Map<string, (typeof eventTones)[number]>();
    professionals.forEach((professional, index) => {
      map.set(professional.id, eventTones[index % eventTones.length] ?? 'teal');
    });
    return map;
  }, [professionals]);

  const visible = useMemo(() => appointments.filter((item) => {
    if (professionalFilter && item.professionalId !== professionalFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (unitFilter && item.unitId !== unitFilter) return false;
    return true;
  }), [appointments, professionalFilter, statusFilter, unitFilter]);

  const columns = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(reference);
      return Array.from({ length: 5 }, (_, index) => {
        const date = addDays(from, index);
        return {
          key: date.toISOString(),
          label: weekdayNames[date.getDay()],
          detail: dayMonth.format(date),
          active: sameDay(date, new Date()),
          match: (item: RecordValue) => sameDay(new Date(String(item.startAt)), date),
        };
      });
    }
    if (mode === 'chairs') {
      const chairs = units
        .filter((unit) => !unitFilter || unit.id === unitFilter)
        .flatMap((unit) => unit.chairs.map((chair) => ({ ...chair, unitName: unit.name })));
      if (!chairs.length) return [];
      return chairs.map((chair) => ({
        key: chair.id,
        label: chair.name,
        detail: chair.unitName,
        active: false,
        match: (item: RecordValue) => item.chairId === chair.id,
      }));
    }
    const active = professionals.filter((professional) => !professionalFilter || professional.id === professionalFilter);
    if (!active.length) return [];
    return active.map((professional) => ({
      key: professional.id,
      label: professional.name,
      detail: professional.croNumber ? `CRO ${professional.croNumber}` : 'Profissional',
      active: false,
      match: (item: RecordValue) => item.professionalId === professional.id,
    }));
  }, [mode, reference, units, unitFilter, professionals, professionalFilter]);

  const hours = useMemo(() => {
    const used = visible.map((item) => new Date(String(item.startAt)).getHours());
    const min = Math.min(8, ...(used.length ? used : [8]));
    const max = Math.max(18, ...(used.length ? used : [18]));
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [visible]);

  const title = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(reference);
      const to = addDays(from, 4);
      return `${from.getDate()}–${to.getDate()} de ${monthYear.format(to)}`;
    }
    return longDate.format(reference);
  }, [mode, reference]);

  const confirmed = visible.filter((item) => item.status === 'CONFIRMED').length;
  const waiting = visible.filter((item) => item.status === 'CHECKED_IN').length;
  const cancelled = visible.filter((item) => ['CANCELLED', 'NO_SHOW'].includes(String(item.status))).length;

  function shift(direction: number) {
    setReference((current) => addDays(current, mode === 'week' ? direction * 7 : direction));
  }

  const chairs = useMemo(() => units.flatMap((unit) => unit.chairs), [units]);
  const hideUnitChair = units.length <= 1 && chairs.length <= 1;

  async function updateAppointmentStatus(status: string) {
    if (!selectedAppointment) return;
    setStatusSaving(true);
    setFormError('');
    try {
      const reminders = list(selectedAppointment.reminders);
      await api.put(`/appointments/${String(selectedAppointment.id)}`, {
        clinicId,
        unitId: String(selectedAppointment.unitId),
        patientId: String(selectedAppointment.patientId),
        professionalId: String(selectedAppointment.professionalId),
        chairId: String(selectedAppointment.chairId ?? '') || undefined,
        startAt: String(selectedAppointment.startAt),
        endAt: String(selectedAppointment.endAt),
        status,
        notes: text(selectedAppointment.notes, '') || undefined,
        tagIds: list(selectedAppointment.tags)
          .map((item) => String(nested(item, 'tag').id || item.tagId || ''))
          .filter(Boolean),
        reminderEnabled: reminders.length > 0,
        reminderLeadMinutes: reminders.map((item) => Number(item.leadMinutes)).filter((value) => Number.isFinite(value) && value > 0),
      });
      setSelectedAppointment({ ...selectedAppointment, status });
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o status.');
    } finally {
      setStatusSaving(false);
    }
  }

  async function updateAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAppointment) return;
    if (!editingAppointment) {
      setEditingAppointment(true);
      return;
    }
    const data = new FormData(event.currentTarget);
    const startAt = new Date(String(data.get('startAt'))).toISOString();
    const duration = Number(data.get('duration'));
    const endAt = new Date(new Date(startAt).getTime() + duration * 60_000).toISOString();
    const reminderLeads = data.getAll('reminderLeadMinutes').map(Number).filter((value) => Number.isFinite(value) && value > 0);
    setSaving(true);
    setFormError('');
    try {
      await api.put(`/appointments/${String(selectedAppointment.id)}`, {
        clinicId,
        unitId: String(data.get('unitId') || selectedAppointment.unitId),
        patientId: String(selectedAppointment.patientId),
        professionalId: String(data.get('professionalId')),
        chairId: String(data.get('chairId') ?? '') || undefined,
        startAt,
        endAt,
        status: String(data.get('status')),
        notes: String(data.get('notes') ?? '').trim() || undefined,
        tagIds: data.getAll('tagIds').map(String),
        reminderEnabled: data.get('reminderEnabled') === 'on',
        reminderLeadMinutes: reminderLeads.length ? reminderLeads : 1440,
      });
      setSelectedAppointment(null);
      setEditingAppointment(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o agendamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Agenda clínica"
        description="Visualização por profissional, cadeira, unidade e status."
        actions={
          <>
            <button className="button" type="button" onClick={() => setReference(startOfDay(new Date()))}>Hoje</button>
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
              onClick={() => setFormOpen(true)}
            >
              <Plus size={15} />Agendar
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <section className="stats">
        <MetricCard label="Atendimentos no período" value={visible.length} meta={`${confirmed} confirmados`} />
        <MetricCard label="Na clínica agora" value={waiting} meta="Check-in realizado" />
        <MetricCard
          label="Confirmações pendentes"
          value={Math.max(0, visible.length - confirmed - cancelled)}
          meta="Acompanhar contato"
          tone="amber"
        />
        <MetricCard
          label="Cancelamentos e faltas"
          value={cancelled}
          meta={cancelled ? 'Revisar encaixes' : 'Nenhum no período'}
          tone={cancelled ? 'red' : 'green'}
        />
      </section>
      <Modal open={formOpen} title="Novo agendamento" description="Crie a consulta sem sair da agenda." onClose={() => setFormOpen(false)} size="large">
        <ModuleActions
          module="agenda"
          clinicId={clinicId}
          clinics={clinics}
          professionals={professionals}
          patients={patients}
          selectedPatientId={queryPatientId}
          onPatientChange={() => undefined}
          onSaved={load}
        />
      </Modal>
      <Modal
        open={Boolean(selectedAppointment)}
        title="Detalhes do agendamento"
        description={editingAppointment ? 'Edite horário, profissional, etiquetas e lembretes.' : 'Visualização do agendamento. Status pode ser alterado a qualquer momento.'}
        onClose={() => { setSelectedAppointment(null); setFormError(''); setEditingAppointment(false); }}
        size="large"
      >
        {selectedAppointment ? (
          <form className="mutation-form appointment-detail-form" onSubmit={updateAppointment}>
            <div className="appointment-detail-hero span-2">
              <div>
                <small>Paciente</small>
                <Link className="clickable-name" href={`/pacientes/${String(selectedAppointment.patientId)}`}>
                  {text(nested(selectedAppointment, 'patient').fullName)}
                </Link>
              </div>
              <label className="status-inline">
                Status
                <select
                  name="status"
                  value={String(selectedAppointment.status)}
                  disabled={statusSaving}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSelectedAppointment({ ...selectedAppointment, status: next });
                    void updateAppointmentStatus(next);
                  }}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {editingAppointment ? (
              <>
                <label>Início<input name="startAt" type="datetime-local" required defaultValue={new Date(String(selectedAppointment.startAt)).toISOString().slice(0, 16)} /></label>
                <label>Duração (min)
                  <select
                    name="duration"
                    required
                    defaultValue={nearestDurationMinutes(
                      Math.round((new Date(String(selectedAppointment.endAt)).getTime() - new Date(String(selectedAppointment.startAt)).getTime()) / 60000),
                    )}
                  >
                    {APPOINTMENT_DURATIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} min</option>
                    ))}
                  </select>
                </label>
                <SearchableSelect name="professionalId" label="Profissional" defaultValue={String(selectedAppointment.professionalId)} options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
                {!hideUnitChair ? (
                  <>
                    <SearchableSelect name="unitId" label="Unidade" defaultValue={String(selectedAppointment.unitId)} options={units.map((item) => ({ value: item.id, label: item.name }))} />
                    <SearchableSelect name="chairId" label="Cadeira" defaultValue={text(selectedAppointment.chairId, '')} placeholder="Sem cadeira" options={chairs.map((item) => ({ value: item.id, label: item.name }))} />
                  </>
                ) : (
                  <>
                    <input type="hidden" name="unitId" value={String(selectedAppointment.unitId)} />
                    <input type="hidden" name="chairId" value={text(selectedAppointment.chairId, '')} />
                  </>
                )}
                <label className="span-2">Observações<textarea name="notes" defaultValue={text(selectedAppointment.notes, '')} rows={3} /></label>
                <MultiSelect
                  name="tagIds"
                  label="Etiquetas"
                  defaultValues={list(selectedAppointment.tags).map((item) => String(nested(item, 'tag').id || item.tagId)).filter(Boolean)}
                  options={tags.map((tag) => ({ value: String(tag.id), label: text(tag.name), color: text(tag.color, undefined) }))}
                  placeholder="Selecionar etiquetas"
                />
                <label className="check-field span-2"><input name="reminderEnabled" type="checkbox" defaultChecked={list(selectedAppointment.reminders).length > 0} /> Lembrete automático via WhatsApp</label>
                <MultiSelect
                  name="reminderLeadMinutes"
                  label="Antecedência"
                  defaultValues={list(selectedAppointment.reminders).map((item) => String(item.leadMinutes || 1440))}
                  options={[
                    { value: '120', label: '2 horas' },
                    { value: '1440', label: '24 horas' },
                    { value: '2880', label: '48 horas' },
                  ]}
                  placeholder="Selecionar antecedências"
                />
                {list(selectedAppointment.reminders).some((item) => item.status === 'DISABLED') ? (
                  <p className="form-error span-2">Evolution não configurado: lembrete salvo, mas não ativo.</p>
                ) : null}
              </>
            ) : (
              <div className="appointment-readonly span-2">
                <div className="info-grid">
                  <div className="info-item"><small>Início</small><strong>{timeOnly(selectedAppointment.startAt)}</strong></div>
                  <div className="info-item"><small>Duração</small><strong>{Math.round((new Date(String(selectedAppointment.endAt)).getTime() - new Date(String(selectedAppointment.startAt)).getTime()) / 60000)} min</strong></div>
                  <div className="info-item"><small>Profissional</small><strong>{text(nested(selectedAppointment, 'professional').name)}</strong></div>
                  {!hideUnitChair ? (
                    <>
                      <div className="info-item"><small>Unidade</small><strong>{text(units.find((item) => item.id === selectedAppointment.unitId)?.name)}</strong></div>
                      <div className="info-item"><small>Cadeira</small><strong>{text(nested(selectedAppointment, 'chair').name)}</strong></div>
                    </>
                  ) : null}
                  <div className="info-item span-2"><small>Observações</small><strong>{text(selectedAppointment.notes, 'Sem observações')}</strong></div>
                </div>
                {list(selectedAppointment.tags).length ? (
                  <div className="chip-row" style={{ marginTop: 10 }}>
                    {list(selectedAppointment.tags).map((item) => {
                      const tag = nested(item, 'tag');
                      return <span className="chip" key={String(tag.id || item.id)} style={{ color: text(tag.color) }}>{text(tag.name)}</span>;
                    })}
                  </div>
                ) : null}
              </div>
            )}

            <div className="modal-footer span-2">
              {editingAppointment ? (
                <button type="button" className="button soft" onClick={() => setEditingAppointment(false)}>Cancelar edição</button>
              ) : null}
              <button className="button primary" disabled={saving}>
                {editingAppointment ? (saving ? 'Salvando…' : 'Salvar alterações') : 'Editar agendamento'}
              </button>
            </div>
            {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          </form>
        ) : null}
      </Modal>
      <Panel
        title={title}
        description={`${clinic?.tradeName ?? 'Unidade'} · ${professionalFilter ? text(professionals.find((item) => item.id === professionalFilter)?.name) : 'Todos os profissionais'}`}
        actions={
          <div className="head-actions">
            <div className="segmented" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={mode === 'day' ? 'active' : ''}
                aria-pressed={mode === 'day'}
                onClick={() => setMode('day')}
              >Dia</button>
              <button
                type="button"
                className={mode === 'week' ? 'active' : ''}
                aria-pressed={mode === 'week'}
                onClick={() => setMode('week')}
              >Semana</button>
              <button
                type="button"
                className={mode === 'chairs' ? 'active' : ''}
                aria-pressed={mode === 'chairs'}
                onClick={() => setMode('chairs')}
              >Cadeiras</button>
            </div>
            <div className="segmented" role="group" aria-label="Navegar no período">
              <button type="button" onClick={() => shift(-1)} aria-label="Período anterior"><ChevronLeft size={15} /></button>
              <button type="button" onClick={() => shift(1)} aria-label="Próximo período"><ChevronRight size={15} /></button>
            </div>
          </div>
        }
      >
        {filtersOpen && (
          <div className="filters">
            <select
              className="filter-select"
              aria-label="Filtrar por profissional"
              value={professionalFilter}
              onChange={(event) => setProfessionalFilter(event.target.value)}
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              aria-label="Filtrar por unidade"
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
            >
              <option value="">Todas as unidades</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select
              className="filter-select"
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              className="button"
              type="button"
              onClick={() => { setProfessionalFilter(''); setStatusFilter(''); setUnitFilter(''); }}
            >Limpar filtros</button>
          </div>
        )}
        {loading && <div className="state-message">Carregando agenda…</div>}
        {!loading && columns.length === 0 && (
          <div className="state-message">
            {mode === 'chairs'
              ? 'Nenhuma cadeira cadastrada nesta unidade.'
              : 'Nenhum profissional ativo para exibir colunas.'}
          </div>
        )}
        {!loading && columns.length > 0 && (
          <div className="week-scroll">
            <div
              className="week-board"
              style={{ ['--week-columns' as string]: String(columns.length) }}
            >
              <div className="week-head" />
              {columns.map((column) => (
                <div key={column.key} className={`week-head ${column.active ? 'active' : ''}`}>
                  {column.label}
                  <small>{column.detail}</small>
                </div>
              ))}
              {hours.map((hour) => (
                <div key={hour} style={{ display: 'contents' }}>
                  <div className="hour">{String(hour).padStart(2, '0')}:00</div>
                  {columns.map((column) => {
                    const slot = visible.filter((item) => {
                      const start = new Date(String(item.startAt));
                      return start.getHours() === hour && column.match(item);
                    });
                    return (
                      <div key={column.key} className={`day-slot ${column.active ? 'active' : ''}`}>
                        {slot.map((item) => {
                          const patient = nested(item, 'patient');
                          const professional = nested(item, 'professional');
                          const tone = toneByProfessional.get(String(item.professionalId)) ?? 'teal';
                          const isCancelled = ['CANCELLED', 'NO_SHOW'].includes(String(item.status));
                          const label = `${timeOnly(item.startAt)} ${text(patient.fullName, 'Paciente')} · ${text(professional.name)} · ${statusLabels[String(item.status)] ?? text(item.status)}`;
                          return (
                            <button
                              key={String(item.id)}
                              type="button"
                              className={`event ${tone} ${isCancelled ? 'cancelled' : ''}`.trim()}
                              title={label}
                              aria-label={label}
                              onClick={() => { setSelectedAppointment(item); setEditingAppointment(false); setFormError(''); }}
                            >
                              <small>{timeOnly(item.startAt)} · {text(professional.name).split(' ')[0]}</small>
                              <strong>{text(patient.fullName, 'Paciente')}</strong>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="agenda-legend">
          {professionals.map((professional) => (
            <span key={professional.id}>
              <i style={{ background: `var(--${toneByProfessional.get(professional.id) === 'teal' ? 'accent' : toneByProfessional.get(professional.id)})` }} />
              {professional.name}
            </span>
          ))}
        </div>
      </Panel>
      <Panel title="Lista do período" description="Mesma consulta da grade, em formato tabular para leitura rápida.">
        {!loading && visible.length === 0 && (
          <div className="state-message">Nenhum atendimento no período selecionado.</div>
        )}
        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Paciente</th>
                  <th>Profissional</th>
                  <th>Cadeira</th>
                  <th>Observações</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const patient = nested(item, 'patient');
                  const professional = nested(item, 'professional');
                  const chair = nested(item, 'chair');
                  return (
                    <tr key={String(item.id)}>
                      <td>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(String(item.startAt)))} {timeOnly(item.startAt)}</td>
                      <td>{patient.id ? <Link className="clickable-name" href={`/pacientes/${String(patient.id)}`}>{text(patient.fullName, 'Paciente')}</Link> : <strong>{text(patient.fullName, 'Paciente')}</strong>}</td>
                      <td>{text(professional.name)}</td>
                      <td>{text(chair.name)}</td>
                      <td>{text(item.notes, 'Consulta')}</td>
                      <td>
                        <StatusBadge tone={statusTone(item.status)}>
                          {statusLabels[String(item.status)] ?? text(item.status)}
                        </StatusBadge>
                      </td>
                      <td className="row-actions">
                        {patient.id ? (
                          <button
                            className="button small"
                            type="button"
                            onClick={() => { setSelectedAppointment(item); setEditingAppointment(false); setFormError(''); }}
                          >Detalhes</button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

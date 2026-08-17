'use client';

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Settings2, SlidersHorizontal } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  DEFAULT_BUSINESS_HOURS,
  getBusinessHoursGridBounds,
  hourFromHm,
  isBusinessWeekday,
  isWithinBusinessHourRange,
  normalizeBusinessHours,
  ruleForWeekday,
  type BusinessHours,
} from '@/lib/business-hours';
import { APPOINTMENT_DURATIONS, nearestDurationMinutes } from '@/lib/duration';
import { appointmentEventTone, list, nested, statusTone, text, timeOnly, toDatetimeLocalValue, type RecordValue } from '@/lib/format';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';
import { MultiSelect } from './multi-select';
import { SearchableSelect } from './searchable-select';

type Mode = 'day' | 'week' | 'chairs';
type AgendaViewType = 'calendar' | 'list';

const AGENDA_VIEW_KEY = 'centerClinic.agenda.view';
const AGENDA_PREFS_KEY = 'centerClinic.agenda.prefs';

type AgendaPrefs = {
  hideCancelled: boolean;
  dimPast: boolean;
  showWaiting: boolean;
};

const DEFAULT_AGENDA_PREFS: AgendaPrefs = {
  hideCancelled: true,
  dimPast: true,
  showWaiting: false,
};

const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Altura de cada hora na grade (deve bater com `--slot-height` no CSS). */
const SLOT_HEIGHT_PX = 62;
const SNAP_MINUTES = 15;

type TimedLayout = {
  item: RecordValue;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
};

/** Posiciona eventos na escala contínua da coluna (top/altura) e em faixas laterais se houver sobreposição. */
function layoutColumnEvents(items: RecordValue[], gridStartHour: number, hourCount: number): TimedLayout[] {
  const gridStartMin = gridStartHour * 60;
  const gridEndMin = gridStartMin + hourCount * 60;

  const timed = items.map((item) => {
    const start = new Date(String(item.startAt));
    const end = new Date(String(item.endAt));
    const startMin = start.getHours() * 60 + start.getMinutes();
    const rawEndMin = sameDay(start, end)
      ? end.getHours() * 60 + end.getMinutes()
      : gridEndMin;
    const endMin = Math.max(startMin + SNAP_MINUTES, rawEndMin);
    const clampedStart = Math.min(Math.max(startMin, gridStartMin), gridEndMin);
    const clampedEnd = Math.min(Math.max(endMin, clampedStart + SNAP_MINUTES), gridEndMin);
    return {
      item,
      startMs: start.getTime(),
      endMs: end.getTime(),
      startMin: clampedStart,
      endMin: clampedEnd,
      top: ((clampedStart - gridStartMin) / 60) * SLOT_HEIGHT_PX,
      height: Math.max(((clampedEnd - clampedStart) / 60) * SLOT_HEIGHT_PX, 24),
    };
  }).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.startMs - b.startMs);

  const laneEnds: number[] = [];
  const withLane = timed.map((entry) => {
    let lane = laneEnds.findIndex((end) => end <= entry.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMin);
    } else {
      laneEnds[lane] = entry.endMin;
    }
    return { ...entry, lane };
  });

  return withLane.map((entry) => {
    const overlapping = withLane.filter(
      (other) => other.startMin < entry.endMin && other.endMin > entry.startMin,
    );
    const laneCount = Math.max(1, ...overlapping.map((other) => other.lane + 1));
    return {
      item: entry.item,
      top: entry.top,
      height: entry.height,
      lane: entry.lane,
      laneCount,
    };
  });
}

function snapMinutesFromY(clientY: number, columnTop: number, gridStartHour: number, hourCount: number) {
  const y = Math.max(0, Math.min(clientY - columnTop, hourCount * SLOT_HEIGHT_PX - 1));
  const total = gridStartHour * 60 + (y / SLOT_HEIGHT_PX) * 60;
  const snapped = Math.round(total / SNAP_MINUTES) * SNAP_MINUTES;
  const max = (gridStartHour + hourCount) * 60 - SNAP_MINUTES;
  const clamped = Math.min(Math.max(snapped, gridStartHour * 60), max);
  return { hour: Math.floor(clamped / 60), minutes: clamped % 60 };
}

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  CHECKED_IN: 'Na clínica',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Falta',
};

const statusLegend: Array<{ status: string; tone: ReturnType<typeof appointmentEventTone> }> = [
  { status: 'SCHEDULED', tone: 'blue' },
  { status: 'CONFIRMED', tone: 'green' },
  { status: 'CHECKED_IN', tone: 'teal' },
  { status: 'IN_PROGRESS', tone: 'purple' },
  { status: 'COMPLETED', tone: 'gray' },
  { status: 'CANCELLED', tone: 'red' },
  { status: 'NO_SHOW', tone: 'amber' },
];

function startOfDay(reference: Date) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isPastAppointment(startAt: unknown, today = startOfDay(new Date())) {
  const date = new Date(String(startAt));
  if (Number.isNaN(date.getTime())) return false;
  return date < today;
}

function readAgendaPrefs(): AgendaPrefs {
  try {
    const stored = window.localStorage.getItem(AGENDA_PREFS_KEY);
    if (!stored) return DEFAULT_AGENDA_PREFS;
    const parsed = JSON.parse(stored) as Partial<AgendaPrefs>;
    return {
      hideCancelled: parsed.hideCancelled ?? DEFAULT_AGENDA_PREFS.hideCancelled,
      dimPast: parsed.dimPast ?? DEFAULT_AGENDA_PREFS.dimPast,
      showWaiting: parsed.showWaiting ?? DEFAULT_AGENDA_PREFS.showWaiting,
    };
  } catch {
    return DEFAULT_AGENDA_PREFS;
  }
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
  const [viewType, setViewType] = useState<AgendaViewType>('calendar');
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
  const [editUnitId, setEditUnitId] = useState('');
  const [editChairId, setEditChairId] = useState('');
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [showPersonalCalendar, setShowPersonalCalendar] = useState(false);
  const [personalCalendarAvailable, setPersonalCalendarAvailable] = useState(false);
  const [personalEvents, setPersonalEvents] = useState<RecordValue[]>([]);
  const [personalWarning, setPersonalWarning] = useState('');
  const [acknowledgePersonalWarning, setAcknowledgePersonalWarning] = useState(false);
  const skipNextEventClickRef = useRef(false);
  const [prefs, setPrefs] = useState<AgendaPrefs>(DEFAULT_AGENDA_PREFS);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AGENDA_VIEW_KEY);
      if (stored === 'calendar' || stored === 'list') setViewType(stored);
    } catch {
      /* ignore */
    }
    setPrefs(readAgendaPrefs());
  }, []);

  useEffect(() => {
    if (!prefsOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!prefsRef.current?.contains(event.target as Node)) setPrefsOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [prefsOpen]);

  function updatePref<K extends keyof AgendaPrefs>(key: K, value: AgendaPrefs[K]) {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      try {
        window.localStorage.setItem(AGENDA_PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function changeViewType(next: AgendaViewType) {
    setViewType(next);
    try {
      window.localStorage.setItem(AGENDA_VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

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
    if (!clinicId) return;
    api.get<BusinessHours>(`/settings/business-hours?clinicId=${clinicId}`)
      .then((hours) => setBusinessHours(normalizeBusinessHours(hours)))
      .catch(() => setBusinessHours(DEFAULT_BUSINESS_HOURS));
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) {
      setPersonalCalendarAvailable(false);
      setShowPersonalCalendar(false);
      setPersonalEvents([]);
      return;
    }
    api.get<{ available?: boolean }>(`/appointments/personal-calendar/status?clinicId=${clinicId}`)
      .then((status) => {
        setPersonalCalendarAvailable(Boolean(status.available));
        if (!status.available) {
          setShowPersonalCalendar(false);
          setPersonalEvents([]);
        }
      })
      .catch(() => {
        setPersonalCalendarAvailable(false);
        setShowPersonalCalendar(false);
        setPersonalEvents([]);
      });
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !showPersonalCalendar || !personalCalendarAvailable) {
      setPersonalEvents([]);
      return;
    }
    const query = new URLSearchParams({
      clinicId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    if (professionalFilter) query.set('professionalId', professionalFilter);
    api.get<{ events?: RecordValue[] }>(`/appointments/personal-calendar?${query}`)
      .then((result) => setPersonalEvents(list(result.events)))
      .catch(() => setPersonalEvents([]));
  }, [clinicId, showPersonalCalendar, personalCalendarAvailable, range.from, range.to, professionalFilter]);

  useEffect(() => {
    if (searchParams.get('new') === '1' || searchParams.get('patientId')) {
      setFormOpen(true);
    }
  }, [searchParams]);

  const scoped = useMemo(() => appointments.filter((item) => {
    if (professionalFilter && item.professionalId !== professionalFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (unitFilter && item.unitId !== unitFilter) return false;
    return true;
  }), [appointments, professionalFilter, statusFilter, unitFilter]);

  const visible = useMemo(() => (
    prefs.hideCancelled
      ? scoped.filter((item) => String(item.status) !== 'CANCELLED')
      : scoped
  ), [scoped, prefs.hideCancelled]);

  const waitingPatients = useMemo(() => (
    appointments.filter((item) => {
      if (String(item.status) !== 'CHECKED_IN') return false;
      if (professionalFilter && item.professionalId !== professionalFilter) return false;
      if (unitFilter && item.unitId !== unitFilter) return false;
      return true;
    }).sort((a, b) => new Date(String(a.startAt)).getTime() - new Date(String(b.startAt)).getTime())
  ), [appointments, professionalFilter, unitFilter]);

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
          date,
          match: (item: RecordValue) => sameDay(new Date(String(item.startAt)), date),
        };
      });
    }
    if (mode === 'chairs') {
      const chairColumns = units
        .filter((unit) => !unitFilter || unit.id === unitFilter)
        .flatMap((unit) => unit.chairs.map((chair) => ({ ...chair, unitId: unit.id, unitName: unit.name })));
      if (!chairColumns.length) return [];
      return chairColumns.map((chair) => ({
        key: chair.id,
        label: chair.name,
        detail: chair.unitName,
        active: false,
        chairId: chair.id,
        unitId: chair.unitId,
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
      professionalId: professional.id,
      date: startOfDay(reference),
      match: (item: RecordValue) => item.professionalId === professional.id,
    }));
  }, [mode, reference, units, unitFilter, professionals, professionalFilter]);

  const hours = useMemo(() => {
    const { startHour, endHour } = getBusinessHoursGridBounds(businessHours);
    // Inclui a hora de fechamento na grade (padrão histórico 08–18).
    const configuredMax = Math.max(startHour, endHour);
    const usedHours: number[] = [];
    const timedItems = showPersonalCalendar ? [...visible, ...personalEvents] : visible;
    for (const item of timedItems) {
      const start = new Date(String(item.startAt));
      const end = new Date(String(item.endAt));
      usedHours.push(start.getHours());
      // Garante que o fim do atendimento ainda caiba visualmente na grade.
      const endHourUsed = end.getMinutes() > 0 || end.getSeconds() > 0
        ? end.getHours()
        : Math.max(start.getHours(), end.getHours() - 1);
      if (sameDay(start, end)) usedHours.push(endHourUsed);
    }
    const min = Math.min(startHour, ...(usedHours.length ? usedHours : [startHour]));
    const max = Math.max(configuredMax, ...(usedHours.length ? usedHours : [configuredMax]));
    return Array.from({ length: Math.max(1, max - min + 1) }, (_, index) => min + index);
  }, [visible, personalEvents, showPersonalCalendar, businessHours]);

  const { startHour: businessStartHour, endHour: businessEndHour } = getBusinessHoursGridBounds(businessHours);
  const gridStartHour = hours[0] ?? businessStartHour;
  const hourCount = hours.length;

  const title = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(reference);
      const to = addDays(from, 4);
      return `${from.getDate()}–${to.getDate()} de ${monthYear.format(to)}`;
    }
    return longDate.format(reference);
  }, [mode, reference]);

  const confirmed = scoped.filter((item) => item.status === 'CONFIRMED').length;
  const waiting = scoped.filter((item) => item.status === 'CHECKED_IN').length;
  const cancelled = scoped.filter((item) => ['CANCELLED', 'NO_SHOW'].includes(String(item.status))).length;

  function shift(direction: number) {
    setReference((current) => addDays(current, mode === 'week' ? direction * 7 : direction));
  }

  const chairs = useMemo(
    () => units.flatMap((unit) => unit.chairs.map((chair) => ({ ...chair, unitId: unit.id }))),
    [units],
  );
  const hideUnitChair = units.length <= 1 && chairs.length <= 1;
  const editChairOptions = useMemo(
    () => chairs
      .filter((chair) => chair.unitId === editUnitId && chair.isSchedulingEnabled !== false)
      .map((item) => ({ value: item.id, label: item.name })),
    [chairs, editUnitId],
  );

  function appointmentClinicId(item: RecordValue) {
    return String(item.clinicId || clinicId);
  }

  type ConflictCheckResult = {
    conflict?: boolean;
    warnings?: Array<{ type?: string; message?: string }>;
  };

  async function checkAppointmentSlot(payload: Record<string, unknown>, options?: {
    excludeAppointmentId?: string;
    allowPersonalWarning?: boolean;
  }): Promise<{ blocked: boolean; personalMessage?: string }> {
    const check = await api.post<ConflictCheckResult>('/appointments/check-conflicts', {
      ...payload,
      ...(options?.excludeAppointmentId ? { excludeAppointmentId: options.excludeAppointmentId } : {}),
    }).catch(() => ({ conflict: false, warnings: [] as Array<{ type?: string; message?: string }> }));

    if (check.conflict) {
      return { blocked: true };
    }
    const personal = (check.warnings ?? []).find((item) => item.type === 'personal_calendar');
    if (personal && !options?.allowPersonalWarning) {
      return {
        blocked: false,
        personalMessage: personal.message || 'Há um evento do Google neste horário. Você pode continuar mesmo assim.',
      };
    }
    return { blocked: false };
  }

  function openAppointment(item: RecordValue) {
    setSelectedAppointment(item);
    setEditingAppointment(false);
    setFormError('');
    setPersonalWarning('');
    setAcknowledgePersonalWarning(false);
    setEditUnitId(String(item.unitId ?? ''));
    setEditChairId(text(item.chairId, ''));
  }

  async function persistAppointment(item: RecordValue, patch: {
    startAt: string;
    endAt: string;
    unitId?: string;
    professionalId?: string;
    chairId?: string | null;
    status?: string;
    notes?: string;
    tagIds?: string[];
    reminderEnabled?: boolean;
    reminderLeadMinutes?: number | number[];
  }) {
    const reminders = list(item.reminders);
    const reminderLeads = reminders
      .map((entry) => Number(entry.leadMinutes))
      .filter((value) => Number.isFinite(value) && value > 0);
    await api.put(`/appointments/${String(item.id)}`, {
      clinicId: appointmentClinicId(item),
      unitId: patch.unitId ?? String(item.unitId),
      patientId: String(item.patientId),
      professionalId: patch.professionalId ?? String(item.professionalId),
      chairId: patch.chairId === null
        ? undefined
        : (patch.chairId ?? (String(item.chairId ?? '') || undefined)),
      startAt: patch.startAt,
      endAt: patch.endAt,
      status: patch.status ?? String(item.status),
      notes: Object.prototype.hasOwnProperty.call(patch, 'notes')
        ? (patch.notes || undefined)
        : (text(item.notes, '') || undefined),
      tagIds: patch.tagIds ?? list(item.tags)
        .map((entry) => String(nested(entry, 'tag').id || entry.tagId || ''))
        .filter(Boolean),
      reminderEnabled: patch.reminderEnabled ?? reminders.length > 0,
      reminderLeadMinutes: patch.reminderLeadMinutes ?? (reminderLeads.length ? reminderLeads : 1440),
    });
  }

  async function dropAppointment(
    item: RecordValue,
    column: { date?: Date; professionalId?: string; chairId?: string; unitId?: string },
    hour: number,
    minutes = 0,
  ) {
    if (['CANCELLED', 'NO_SHOW'].includes(String(item.status))) return;
    const previousStart = new Date(String(item.startAt));
    const durationMs = new Date(String(item.endAt)).getTime() - previousStart.getTime();
    const nextStart = new Date(previousStart);
    const day = column.date ?? startOfDay(previousStart);
    nextStart.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    nextStart.setHours(hour, minutes, 0, 0);
    const nextEnd = new Date(nextStart.getTime() + Math.max(durationMs, 15 * 60_000));
    const sameSlot = nextStart.getTime() === previousStart.getTime()
      && (!column.professionalId || column.professionalId === item.professionalId)
      && (!column.chairId || column.chairId === item.chairId);
    if (sameSlot) return;
    setError('');
    setPersonalWarning('');
    try {
      const payload = {
        clinicId: appointmentClinicId(item),
        unitId: column.unitId ?? String(item.unitId),
        patientId: String(item.patientId),
        professionalId: column.professionalId ?? String(item.professionalId),
        chairId: column.chairId ?? (String(item.chairId ?? '') || undefined),
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
      };
      const check = await checkAppointmentSlot(payload, {
        excludeAppointmentId: String(item.id),
        allowPersonalWarning: false,
      });
      if (check.blocked) {
        setError('O horário selecionado está em conflito com outro agendamento.');
        return;
      }
      if (check.personalMessage) {
        const confirmed = window.confirm(
          `${check.personalMessage}\n\nDeseja remarcar mesmo assim?`,
        );
        if (!confirmed) return;
      }
      await persistAppointment(item, {
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
        professionalId: column.professionalId,
        chairId: column.chairId,
        unitId: column.unitId,
      });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível remarcar por arraste.');
    }
  }

  const filterBar = filtersOpen ? (
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
      {personalCalendarAvailable ? (
        <label className="check-field compact filter-toggle" title="Exibe eventos do Google Agenda da clínica e dos profissionais conectados">
          <input
            type="checkbox"
            checked={showPersonalCalendar}
            onChange={(event) => setShowPersonalCalendar(event.target.checked)}
          />
          Eventos do Google
        </label>
      ) : null}
      <button
        className="button"
        type="button"
        onClick={() => {
          setProfessionalFilter('');
          setStatusFilter('');
          setUnitFilter('');
          setShowPersonalCalendar(false);
        }}
      >Limpar filtros</button>
    </div>
  ) : null;

  async function updateAppointmentStatus(status: string) {
    if (!selectedAppointment) return;
    setStatusSaving(true);
    setFormError('');
    try {
      await persistAppointment(selectedAppointment, {
        startAt: String(selectedAppointment.startAt),
        endAt: String(selectedAppointment.endAt),
        status,
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
      setEditUnitId(String(selectedAppointment.unitId ?? ''));
      setEditChairId(text(selectedAppointment.chairId, ''));
      setEditingAppointment(true);
      setPersonalWarning('');
      setAcknowledgePersonalWarning(false);
      return;
    }
    const data = new FormData(event.currentTarget);
    const startAt = new Date(String(data.get('startAt'))).toISOString();
    const duration = Number(data.get('duration'));
    const endAt = new Date(new Date(startAt).getTime() + duration * 60_000).toISOString();
    const reminderLeads = data.getAll('reminderLeadMinutes').map(Number).filter((value) => Number.isFinite(value) && value > 0);
    const unitId = String(data.get('unitId') || editUnitId || selectedAppointment.unitId);
    const chairId = String(data.get('chairId') ?? editChairId ?? '') || undefined;
    const professionalId = String(data.get('professionalId'));
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        clinicId: appointmentClinicId(selectedAppointment),
        unitId,
        patientId: String(selectedAppointment.patientId),
        professionalId,
        chairId,
        startAt,
        endAt,
      };
      const check = await checkAppointmentSlot(payload, {
        excludeAppointmentId: String(selectedAppointment.id),
        allowPersonalWarning: acknowledgePersonalWarning,
      });
      if (check.blocked) {
        setPersonalWarning('');
        setAcknowledgePersonalWarning(false);
        setFormError('O horário selecionado está em conflito com outro agendamento.');
        return;
      }
      if (check.personalMessage) {
        setPersonalWarning(check.personalMessage);
        setAcknowledgePersonalWarning(true);
        return;
      }
      await persistAppointment(selectedAppointment, {
        unitId,
        professionalId,
        chairId: chairId ?? null,
        startAt,
        endAt,
        status: String(data.get('status')),
        notes: String(data.get('notes') ?? '').trim() || undefined,
        tagIds: data.getAll('tagIds').map(String).filter(Boolean),
        reminderEnabled: data.get('reminderEnabled') === 'on',
        reminderLeadMinutes: reminderLeads.length ? reminderLeads : 1440,
      });
      setSelectedAppointment(null);
      setEditingAppointment(false);
      setPersonalWarning('');
      setAcknowledgePersonalWarning(false);
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o agendamento.');
    } finally {
      setSaving(false);
    }
  }

  const agendaSettings = (
    <div className="row-menu" ref={prefsRef}>
      <button
        className={`icon-button ${prefsOpen ? 'active' : ''}`}
        type="button"
        aria-label="Opções da agenda"
        aria-expanded={prefsOpen}
        aria-haspopup="menu"
        title="Opções da agenda"
        onClick={() => setPrefsOpen((value) => !value)}
      >
        <Settings2 size={16} />
      </button>
      {prefsOpen ? (
        <div className="row-menu-popover agenda-prefs-popover" role="menu">
          <label
            className="switch-row"
            title="Libera o horário na grade para um novo agendamento"
          >
            <span className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={prefs.hideCancelled}
                onChange={(event) => updatePref('hideCancelled', event.target.checked)}
                aria-label="Ocultar consultas canceladas"
              />
              <span className="switch-track" aria-hidden />
            </span>
            Ocultar consultas canceladas
          </label>
          <label
            className="switch-row"
            title="Atendimentos de ontem e dias anteriores ficam mais suaves"
          >
            <span className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={prefs.dimPast}
                onChange={(event) => updatePref('dimPast', event.target.checked)}
                aria-label="Reduzir brilho das consultas passadas"
              />
              <span className="switch-track" aria-hidden />
            </span>
            Reduzir brilho
          </label>
          <label
            className="switch-row"
            title="Pacientes com status “Na clínica”"
          >
            <span className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={prefs.showWaiting}
                onChange={(event) => updatePref('showWaiting', event.target.checked)}
                aria-label="Listar pacientes aguardando"
              />
              <span className="switch-track" aria-hidden />
            </span>
            Listar pacientes aguardando
          </label>
        </div>
      ) : null}
    </div>
  );

  const waitingRoom = prefs.showWaiting ? (
    <div className="waiting-room">
      <div className="waiting-room-head">
        <strong>Pacientes aguardando</strong>
        <span>{waitingPatients.length}</span>
      </div>
      {waitingPatients.length === 0 ? (
        <p>Nenhum paciente na clínica no momento.</p>
      ) : (
        <div className="waiting-room-list">
          {waitingPatients.map((item) => {
            const patient = nested(item, 'patient');
            const professional = nested(item, 'professional');
            return (
              <button
                key={String(item.id)}
                type="button"
                className="waiting-room-item"
                onClick={() => openAppointment(item)}
              >
                <span>
                  <strong>{text(patient.fullName, 'Paciente')}</strong>
                  <small>{text(professional.name, 'Profissional')}</small>
                </span>
                <time>{timeOnly(item.startAt)}</time>
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

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
      <Modal open={formOpen} title="Novo agendamento" description="Crie a consulta sem sair da agenda." onClose={() => setFormOpen(false)} confirmOnClose size="large">
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
        onClose={() => {
          setSelectedAppointment(null);
          setFormError('');
          setEditingAppointment(false);
          setPersonalWarning('');
          setAcknowledgePersonalWarning(false);
        }}
        confirmCloseMessage={editingAppointment ? 'Há edição em andamento. Descartar e fechar?' : undefined}
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
                <label>Início<input name="startAt" type="datetime-local" required defaultValue={toDatetimeLocalValue(selectedAppointment.startAt)} /></label>
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
                <SearchableSelect name="professionalId" label="Profissional" required defaultValue={String(selectedAppointment.professionalId)} options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
                {!hideUnitChair ? (
                  <>
                    <SearchableSelect
                      name="unitId"
                      label="Unidade"
                      required
                      value={editUnitId}
                      onChange={(next) => {
                        setEditUnitId(next);
                        const chairStillValid = chairs.some((chair) => chair.id === editChairId && chair.unitId === next);
                        if (!chairStillValid) setEditChairId('');
                      }}
                      options={units.map((item) => ({ value: item.id, label: item.name }))}
                    />
                    <SearchableSelect
                      name="chairId"
                      label="Cadeira"
                      value={editChairId}
                      onChange={setEditChairId}
                      placeholder="Sem cadeira"
                      options={editChairOptions}
                    />
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
                  <p className="form-error span-2">WhatsApp ainda não está configurado: o lembrete foi salvo, mas não será enviado até a integração estar ativa.</p>
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
                <button
                  type="button"
                  className="button soft"
                  onClick={() => {
                    setEditingAppointment(false);
                    setPersonalWarning('');
                    setAcknowledgePersonalWarning(false);
                  }}
                >Cancelar edição</button>
              ) : null}
              <button className="button primary" disabled={saving}>
                {editingAppointment
                  ? (saving ? 'Salvando…' : (acknowledgePersonalWarning ? 'Salvar mesmo assim' : 'Salvar alterações'))
                  : 'Editar agendamento'}
              </button>
            </div>
            {personalWarning ? (
              <div className="secure-notice form-warning span-2" role="status">
                <strong>Aviso da agenda pessoal</strong>
                <span>{personalWarning}</span>
                <span>Clique novamente em “Salvar mesmo assim” para confirmar.</span>
              </div>
            ) : null}
            {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          </form>
        ) : null}
      </Modal>
      <div className="agenda-view-bar">
        <div className="segmented" role="group" aria-label="Visualização da agenda">
          <button
            type="button"
            className={viewType === 'calendar' ? 'active' : ''}
            aria-pressed={viewType === 'calendar'}
            onClick={() => changeViewType('calendar')}
          >Calendário</button>
          <button
            type="button"
            className={viewType === 'list' ? 'active' : ''}
            aria-pressed={viewType === 'list'}
            onClick={() => changeViewType('list')}
          >Lista</button>
        </div>
        <div className="head-actions">
          {viewType === 'calendar' ? (
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
          ) : null}
          <div className="segmented" role="group" aria-label="Navegar no período">
            <button type="button" onClick={() => shift(-1)} aria-label="Período anterior"><ChevronLeft size={15} /></button>
            <button type="button" onClick={() => shift(1)} aria-label="Próximo período"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>
      {viewType === 'calendar' ? (
      <Panel
        className="agenda-board-panel"
        title={title}
        description={`${clinic?.tradeName ?? 'Unidade'} · ${professionalFilter ? text(professionals.find((item) => item.id === professionalFilter)?.name) : 'Todos os profissionais'}`}
        actions={agendaSettings}
      >
        {filterBar}
        {waitingRoom}
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
              style={{
                ['--week-columns' as string]: String(columns.length),
                ['--slot-height' as string]: `${SLOT_HEIGHT_PX}px`,
                ['--hour-count' as string]: String(hourCount),
              }}
            >
              <div className="week-heads">
                <div className="week-head" />
                {columns.map((column) => (
                  <div key={column.key} className={`week-head ${column.active ? 'active' : ''}`}>
                    {column.label}
                    <small>{column.detail}</small>
                  </div>
                ))}
              </div>
              <div className="week-timeline">
                <div className="hour-rail" aria-hidden="true">
                  {hours.map((hour) => (
                    <div key={hour} className="hour">{String(hour).padStart(2, '0')}:00</div>
                  ))}
                </div>
                {columns.map((column, columnIndex) => {
                  const columnDate = 'date' in column && column.date instanceof Date
                    ? column.date
                    : startOfDay(reference);
                  const dayRule = ruleForWeekday(businessHours, columnDate.getDay());
                  const outsideDay = !isBusinessWeekday(businessHours, columnDate);
                  const dayStartHour = dayRule
                    ? hourFromHm(dayRule.start, businessStartHour)
                    : businessStartHour;
                  const dayEndHour = dayRule
                    ? hourFromHm(dayRule.end, businessEndHour)
                    : businessEndHour;
                  const columnItems = visible.filter((item) => column.match(item));
                  const columnPersonal = showPersonalCalendar
                    ? personalEvents.filter((event) => {
                        const eventDay = new Date(String(event.startAt));
                        if (!sameDay(eventDay, columnDate)) return false;
                        // Em vistas com várias colunas no mesmo dia, evita duplicar o mesmo evento.
                        if (mode !== 'week' && columnIndex > 0) return false;
                        return true;
                      })
                    : [];
                  const layouts = layoutColumnEvents(
                    [...columnItems, ...columnPersonal],
                    gridStartHour,
                    hourCount,
                  );

                  const onColumnDragOver = (event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  };

                  const onColumnDrop = (event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    const appointmentId = event.dataTransfer.getData('text/plain');
                    const item = visible.find((entry) => String(entry.id) === appointmentId);
                    if (!item) return;
                    skipNextEventClickRef.current = true;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const { hour, minutes } = snapMinutesFromY(
                      event.clientY,
                      rect.top,
                      gridStartHour,
                      hourCount,
                    );
                    void dropAppointment(item, column, hour, minutes);
                  };

                  return (
                    <div
                      key={column.key}
                      className={`day-column ${column.active ? 'active' : ''} ${outsideDay ? 'outside-hours' : ''}`.trim()}
                      onDragOver={onColumnDragOver}
                      onDrop={onColumnDrop}
                    >
                      <div className="day-slots">
                        {hours.map((hour) => {
                          const outsideHour = outsideDay
                            || !isWithinBusinessHourRange(hour, dayStartHour, dayEndHour);
                          return (
                            <div
                              key={hour}
                              className={`day-slot ${outsideHour ? 'outside-hours' : ''}`.trim()}
                            />
                          );
                        })}
                      </div>
                      <div className="day-events">
                        {layouts.map(({ item, top, height, lane, laneCount }) => {
                          const isPersonal = item.source === 'google_personal';
                          const widthPct = 100 / laneCount;
                          const leftPct = lane * widthPct;
                          const isCompact = height < 40;
                          const isTiny = height < 28;
                          const style = {
                            top,
                            height,
                            left: `calc(${leftPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                            ['--event-h' as string]: `${height}px`,
                          };

                          if (isPersonal) {
                            const ownerLabel = text(
                              item.calendarOwnerName,
                              text(item.calendarOwner) === 'clinic' ? 'Clínica' : 'Profissional',
                            );
                            const summary = text(item.summary, 'Evento do Google');
                            const label = `${timeOnly(item.startAt)} · ${ownerLabel} · ${summary}`;
                            return (
                              <div
                                key={`personal-${String(item.id)}`}
                                className={`event personal ${isCompact ? 'event-compact' : ''} ${isTiny ? 'event-tiny' : ''}`.trim()}
                                title={label}
                                aria-label={label}
                                style={style}
                              >
                                <small>{`${timeOnly(item.startAt)} · ${ownerLabel}`}</small>
                                <strong className={isCompact ? 'event-secondary' : undefined}>{summary}</strong>
                                <span className="event-extra">{ownerLabel}</span>
                              </div>
                            );
                          }

                          const patient = nested(item, 'patient');
                          const professional = nested(item, 'professional');
                          const status = String(item.status);
                          const tone = appointmentEventTone(status);
                          const isCancelled = ['CANCELLED', 'NO_SHOW'].includes(status);
                          const isPast = prefs.dimPast && isPastAppointment(item.startAt);
                          const statusLabel = statusLabels[status] ?? text(status);
                          const patientName = text(patient.fullName, 'Paciente');
                          const professionalName = text(professional.name, 'Profissional');
                          const label = `${timeOnly(item.startAt)} ${patientName} · ${professionalName} · ${statusLabel}`;
                          return (
                            <button
                              key={String(item.id)}
                              type="button"
                              className={`event ${tone} ${isCancelled ? 'cancelled' : ''} ${isPast ? 'past' : ''} ${isCompact ? 'event-compact' : ''} ${isTiny ? 'event-tiny' : ''}`.trim()}
                              title={label}
                              aria-label={label}
                              draggable={!isCancelled}
                              style={style}
                              onDragStart={(event) => {
                                event.dataTransfer.setData('text/plain', String(item.id));
                                event.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(event) => {
                                // Repassa ao handler da coluna (Y → horário).
                                event.preventDefault();
                                event.stopPropagation();
                                const columnEl = event.currentTarget.closest('.day-column');
                                if (!(columnEl instanceof HTMLElement)) return;
                                const appointmentId = event.dataTransfer.getData('text/plain');
                                const dropped = visible.find((entry) => String(entry.id) === appointmentId);
                                if (!dropped) return;
                                skipNextEventClickRef.current = true;
                                const rect = columnEl.getBoundingClientRect();
                                const { hour, minutes } = snapMinutesFromY(
                                  event.clientY,
                                  rect.top,
                                  gridStartHour,
                                  hourCount,
                                );
                                void dropAppointment(dropped, column, hour, minutes);
                              }}
                              onDragEnd={() => {
                                window.setTimeout(() => { skipNextEventClickRef.current = false; }, 0);
                              }}
                              onClick={() => {
                                if (skipNextEventClickRef.current) {
                                  skipNextEventClickRef.current = false;
                                  return;
                                }
                                openAppointment(item);
                              }}
                            >
                              <small>
                                {isCompact
                                  ? `${timeOnly(item.startAt)} · ${patientName}`
                                  : `${timeOnly(item.startAt)} · ${statusLabel}`}
                              </small>
                              <strong className={isCompact ? 'event-secondary' : undefined}>{patientName}</strong>
                              <span className="event-extra">{isCompact ? `${statusLabel} · ${professionalName}` : professionalName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div className="agenda-legend" aria-label="Legenda por status">
          {statusLegend.map(({ status, tone }) => (
            <span key={status}>
              <i className={`legend-swatch ${tone}`} />
              {statusLabels[status]}
            </span>
          ))}
          {showPersonalCalendar ? (
            <span>
              <i className="legend-swatch personal" />
              Google Agenda
            </span>
          ) : null}
        </div>
      </Panel>
      ) : (
      <Panel
        className="agenda-board-panel"
        title="Lista do período"
        description={`${clinic?.tradeName ?? 'Unidade'} · ${title} · ${professionalFilter ? text(professionals.find((item) => item.id === professionalFilter)?.name) : 'Todos os profissionais'}`}
        actions={agendaSettings}
      >
        {filterBar}
        {waitingRoom}
        {loading && <div className="state-message">Carregando agenda…</div>}
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
                  const isPast = prefs.dimPast && isPastAppointment(item.startAt);
                  return (
                    <tr key={String(item.id)} className={isPast ? 'is-past' : undefined}>
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
                            onClick={() => openAppointment(item)}
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
      )}
    </>
  );
}

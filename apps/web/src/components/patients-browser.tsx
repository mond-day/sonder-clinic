'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, MoreHorizontal, Pencil, Plus, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  dateOnly,
  initials,
  list,
  text,
  timeOnly,
  type RecordValue,
} from '@/lib/format';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { EmptyState, PageHeader, Panel, StatusBadge } from './ui';

type Filter = 'all' | 'treatment' | 'returns' | 'finance';

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos os pacientes' },
  { key: 'treatment', label: 'Em tratamento' },
  { key: 'returns', label: 'Com retorno pendente' },
  { key: 'finance', label: 'Com pendência financeira' },
];

type Enriched = {
  patient: RecordValue;
  lastVisit: Date | null;
  nextAppointment: RecordValue | null;
  treatment: string;
  pendingReturn: RecordValue | null;
  openFinance: number;
  inLab: boolean;
  status: { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple' };
};

function nextActionLabel(appointment: RecordValue | null, pendingReturn: RecordValue | null) {
  if (appointment) {
    const start = new Date(String(appointment.startAt));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(start);
    target.setHours(0, 0, 0, 0);
    const days = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (days === 0) return `Consulta hoje, ${timeOnly(appointment.startAt)}`;
    if (days === 1) return `Consulta amanhã, ${timeOnly(appointment.startAt)}`;
    return `Consulta em ${dateOnly(appointment.startAt)}`;
  }
  if (pendingReturn) {
    const due = new Date(String(pendingReturn.dueAt));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime() ? 'Retorno vencido' : `Retorno em ${dateOnly(pendingReturn.dueAt)}`;
  }
  return 'Sem próxima ação';
}

export function PatientsBrowser() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit') ?? '';
  const { clinicId, clinics, professionals } = useSelection();
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [appointments, setAppointments] = useState<RecordValue[]>([]);
  const [plans, setPlans] = useState<RecordValue[]>([]);
  const [returns, setReturns] = useState<RecordValue[]>([]);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [labCases, setLabCases] = useState<RecordValue[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(Boolean(editId));
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ clinicId });
    if (query.trim()) params.set('search', query.trim());
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    const to = new Date();
    to.setMonth(to.getMonth() + 6);
    const agendaQuery = new URLSearchParams({
      clinicId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    Promise.all([
      api.get<RecordValue[]>(`/patients?${params}`),
      api.get<RecordValue[]>(`/appointments?${agendaQuery}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/treatment-plans?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/return-alerts?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/lab-cases?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextPatients, nextAppointments, nextPlans, nextReturns, nextReceivables, nextLab]) => {
        setPatients(list(nextPatients));
        setAppointments(list(nextAppointments));
        setPlans(list(nextPlans));
        setReturns(list(nextReturns));
        setReceivables(list(nextReceivables));
        setLabCases(list(nextLab));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar pacientes.'))
      .finally(() => setLoading(false));
  }, [clinicId, query]);

  useEffect(() => {
    const handle = window.setTimeout(load, query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [load, query]);

  const enriched = useMemo<Enriched[]>(() => {
    const now = Date.now();
    return patients.map((patient) => {
      const id = String(patient.id);
      const own = appointments.filter((item) => String(item.patientId) === id && !['CANCELLED', 'NO_SHOW'].includes(String(item.status)));
      const past = own
        .filter((item) => new Date(String(item.startAt)).getTime() <= now)
        .sort((a, b) => new Date(String(b.startAt)).getTime() - new Date(String(a.startAt)).getTime());
      const upcoming = own
        .filter((item) => new Date(String(item.startAt)).getTime() > now)
        .sort((a, b) => new Date(String(a.startAt)).getTime() - new Date(String(b.startAt)).getTime());
      const activePlan = plans.find((item) => String(item.patientId) === id
        && ['APPROVED', 'IN_PROGRESS', 'PARTIALLY_APPROVED', 'PRESENTED'].includes(String(item.status)));
      const pendingReturn = returns
        .filter((item) => String(item.patientId) === id && ['PENDING', 'CONTACTED'].includes(String(item.status)))
        .sort((a, b) => new Date(String(a.dueAt)).getTime() - new Date(String(b.dueAt)).getTime())[0] ?? null;
      const openFinance = receivables.filter((item) => String(item.patientId) === id
        && !['PAID', 'CANCELLED'].includes(String(item.status))).length;
      const inLab = labCases.some((item) => String(item.patientId) === id
        && ['REQUESTED', 'IN_LAB', 'RETURNED'].includes(String(item.status)));

      const overdueReturn = pendingReturn
        && new Date(String(pendingReturn.dueAt)).getTime() < new Date().setHours(0, 0, 0, 0);

      let status: Enriched['status'] = { label: 'Ativo', tone: 'gray' };
      if (!past.length) status = { label: 'Novo', tone: 'gray' };
      else if (inLab) status = { label: 'Laboratório', tone: 'blue' };
      else if (overdueReturn) status = { label: 'Acompanhar', tone: 'amber' };
      else if (activePlan) status = { label: 'Em tratamento', tone: 'green' };

      return {
        patient,
        lastVisit: past[0] ? new Date(String(past[0].startAt)) : null,
        nextAppointment: upcoming[0] ?? null,
        treatment: activePlan ? text(activePlan.title) : text(past[0]?.notes, 'Sem tratamento ativo'),
        pendingReturn,
        openFinance,
        inLab,
        status,
      };
    });
  }, [patients, appointments, plans, returns, receivables, labCases]);

  const visible = useMemo(() => enriched.filter((row) => {
    if (filter === 'treatment') return row.status.label === 'Em tratamento' || row.inLab;
    if (filter === 'returns') return Boolean(row.pendingReturn);
    if (filter === 'finance') return row.openFinance > 0;
    return true;
  }), [enriched, filter]);

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Pesquise primeiro. O prontuário abre em uma tela exclusiva, sem expor outros pacientes."
        actions={
          <>
            <button className="button secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={15} />Atualizar
            </button>
            <button
              className="button primary"
              type="button"
              aria-expanded={formOpen}
              onClick={() => setFormOpen((value) => !value)}
            >
              <Plus size={15} />Novo paciente
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      {formOpen && (
        <ModuleActions
          module="pacientes"
          clinicId={clinicId}
          clinics={clinics}
          professionals={professionals}
          patients={patients}
          selectedPatientId={editId}
          onPatientChange={() => undefined}
          onSaved={load}
        />
      )}
      <Panel
        title="Pesquisa de pacientes"
        description={`${visible.length} ${visible.length === 1 ? 'paciente' : 'pacientes'} · dados combinados de agenda, tratamentos, retornos e financeiro`}
      >
        <div className="filters">
          <input
            className="filter-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar por nome, CPF ou telefone"
            aria-label="Pesquisar pacientes"
          />
          <select
            className="filter-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
            aria-label="Filtrar pacientes"
          >
            {filters.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        {loading && <div className="state-message">Carregando…</div>}
        {!loading && visible.length === 0 && (
          <EmptyState title="Nenhum paciente encontrado" description="Ajuste a busca ou cadastre um novo paciente." />
        )}
        {visible.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Contato</th>
                  <th>Última consulta</th>
                  <th>Tratamento atual</th>
                  <th>Próxima ação</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const patient = row.patient;
                  const patientId = String(patient.id);
                  return (
                    <tr key={patientId}>
                      <td>
                        <div className="person-cell">
                          <div className="avatar">{initials(patient.fullName)}</div>
                          <div>
                            <Link className="clickable-name" href={`/pacientes/${patientId}`}>{text(patient.fullName)}</Link>
                            <span>
                              {row.lastVisit
                                ? `Última consulta ${dateOnly(row.lastVisit)}`
                                : 'Primeiro contato'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{text(patient.primaryPhone)}</td>
                      <td>{row.lastVisit ? dateOnly(row.lastVisit) : 'Primeiro contato'}</td>
                      <td>{row.treatment}</td>
                      <td>{nextActionLabel(row.nextAppointment, row.pendingReturn)}</td>
                      <td>
                        <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge>
                        {row.openFinance > 0 && (
                          <span className="sensitive" style={{ marginLeft: 6, display: 'inline-block' }}>
                            <StatusBadge tone="red">{row.openFinance} em aberto</StatusBadge>
                          </span>
                        )}
                      </td>
                      <td className="row-actions">
                        <Link
                          className="icon-button"
                          href={`/pacientes?edit=${patientId}`}
                          aria-label={`Editar ${text(patient.fullName)}`}
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </Link>
                        <Link
                          className="icon-button"
                          href={`/pacientes/${patientId}`}
                          aria-label={`Visualizar ${text(patient.fullName)}`}
                          title="Visualizar"
                        >
                          <Eye size={15} />
                        </Link>
                        <div className="row-menu">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Mais ações"
                            aria-expanded={menuOpenId === patientId}
                            title="Mais ações"
                            onClick={() => setMenuOpenId((current) => (current === patientId ? null : patientId))}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {menuOpenId === patientId ? (
                            <div className="row-menu-popover" role="menu">
                              <Link role="menuitem" href={`/pacientes/${patientId}?tab=financeiro`}>Financeiro</Link>
                              <Link role="menuitem" href={`/pacientes/${patientId}?tab=documentos`}>Documentos</Link>
                              <Link role="menuitem" href={`/agenda`}>Agendar</Link>
                            </div>
                          ) : null}
                        </div>
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

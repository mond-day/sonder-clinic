'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { list, nested, text, type RecordValue } from '@/lib/format';
import { useSelection } from './selection-provider';
import { useWorkspace, type ReturnSummary } from './workspace-provider';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge } from './ui';

type Tab = 'PENDING' | 'CONTACTED' | 'SCHEDULED';

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'PENDING', label: 'Pendentes' },
  { key: 'CONTACTED', label: 'Contatados' },
  { key: 'SCHEDULED', label: 'Agendados' },
];

const channelLabels: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Telefone',
  EMAIL: 'E-mail',
  IN_PERSON: 'Presencial',
};

const createSchema = z.object({
  patientId: z.string().uuid('Selecione um paciente.'),
  reason: z.string().trim().min(3, 'Descreva o motivo do retorno.'),
  dueAt: z.string().datetime(),
  specialty: z.string().trim().optional(),
  preferredChannel: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON']),
  professionalId: z.string().uuid().optional(),
});

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dueDescriptor(dueAt: unknown) {
  const date = new Date(String(dueAt));
  if (Number.isNaN(date.getTime())) return { tone: 'gray' as const, label: 'Sem prazo', detail: 'Sem prazo definido' };
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return {
      tone: 'red' as const,
      label: 'Vencido',
      detail: days === -1 ? 'Vencido há 1 dia' : `Vencido há ${Math.abs(days)} dias`,
    };
  }
  if (days === 0) return { tone: 'amber' as const, label: 'Hoje', detail: 'Retorno previsto para hoje' };
  if (days === 1) return { tone: 'blue' as const, label: 'Amanhã', detail: 'Retorno previsto para amanhã' };
  return { tone: 'blue' as const, label: 'Próximo', detail: `Retorno em ${days} dias` };
}

function whatsappLink(phone: unknown) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

export function ReturnsView() {
  const router = useRouter();
  const { clinicId, professionals } = useSelection();
  const { refresh: refreshWorkspace } = useWorkspace();
  const [alerts, setAlerts] = useState<RecordValue[]>([]);
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [tab, setTab] = useState<Tab>('PENDING');
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [assignee, setAssignee] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [openMenuId, setOpenMenuId] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>(`/return-alerts?clinicId=${clinicId}`),
      api.get<ReturnSummary>(`/return-alerts/summary?clinicId=${clinicId}`),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextAlerts, nextSummary, nextPatients]) => {
        setAlerts(list(nextAlerts));
        setSummary(nextSummary);
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os retornos.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  const specialties = useMemo(
    () => [...new Set(alerts.map((item) => text(item.specialty, '')).filter(Boolean))].sort(),
    [alerts],
  );

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    alerts.forEach((item) => {
      const owner = nested(item, 'assignee');
      if (owner.id) map.set(String(owner.id), text(owner.name));
    });
    return [...map.entries()];
  }, [alerts]);

  const bySpecialty = useMemo(() => {
    const counts = new Map<string, number>();
    alerts
      .filter((item) => !['DONE', 'DISMISSED'].includes(String(item.status)))
      .forEach((item) => {
        const key = text(item.specialty, 'Sem especialidade');
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [alerts]);

  const visible = useMemo(() => alerts.filter((item) => {
    const status = String(item.status);
    if (tab === 'PENDING' && status !== 'PENDING') return false;
    if (tab === 'CONTACTED' && status !== 'CONTACTED') return false;
    if (tab === 'SCHEDULED' && !['SCHEDULED', 'DONE'].includes(status)) return false;
    if (specialty && text(item.specialty, '') !== specialty) return false;
    if (assignee && String(nested(item, 'assignee').id ?? '') !== assignee) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      const haystack = `${text(nested(item, 'patient').fullName, '')} ${text(item.reason, '')}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }), [alerts, tab, specialty, assignee, search]);

  const counts = useMemo(() => ({
    PENDING: alerts.filter((item) => item.status === 'PENDING').length,
    CONTACTED: alerts.filter((item) => item.status === 'CONTACTED').length,
    SCHEDULED: alerts.filter((item) => ['SCHEDULED', 'DONE'].includes(String(item.status))).length,
  }), [alerts]);

  async function patch(id: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setFormError('');
    try {
      await api.patch(`/return-alerts/${id}`, body);
      setFormMessage(success);
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o retorno.');
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDue = String(data.get('dueAt') ?? '');
    const parsed = createSchema.safeParse({
      patientId: String(data.get('patientId') ?? ''),
      reason: String(data.get('reason') ?? ''),
      dueAt: rawDue ? new Date(rawDue).toISOString() : '',
      specialty: String(data.get('specialty') ?? '').trim() || undefined,
      preferredChannel: String(data.get('preferredChannel') ?? 'WHATSAPP'),
      professionalId: String(data.get('professionalId') ?? '') || undefined,
    });
    if (!parsed.success) {
      setFormMessage('');
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api.post('/return-alerts', { ...parsed.data, clinicId });
      setFormMessage('Alerta de retorno criado.');
      form.reset();
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o alerta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Central de retornos"
        description="Acompanhe lembretes clínicos, contatos, reagendamentos e pacientes sem continuidade."
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
              <Plus size={15} />Novo retorno
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <section className="stats">
        <MetricCard
          label="Vencidos"
          value={summary?.overdue ?? 0}
          meta={summary?.overdue ? 'Contato prioritário' : 'Nenhum vencido'}
          tone={summary?.overdue ? 'red' : 'green'}
          icon={<AlertTriangle size={17} />}
          iconTone={summary?.overdue ? 'red' : 'green'}
        />
        <MetricCard
          label="Para hoje"
          value={summary?.today ?? 0}
          meta={`${summary?.contacted ?? 0} já contatados`}
          tone="amber"
          icon={<Clock size={17} />}
          iconTone="amber"
        />
        <MetricCard
          label="Próximos 7 dias"
          value={summary?.next7Days ?? 0}
          meta="Agenda preventiva"
          icon={<CalendarDays size={17} />}
          iconTone="blue"
        />
        <MetricCard
          label="Conversão em 30 dias"
          value={`${summary?.conversionRate ?? 0}%`}
          meta={`${summary?.scheduled ?? 0} agendados`}
          icon={<TrendingUp size={17} />}
        />
      </section>
      {formOpen && (
        <section className="panel mutation-panel">
          <header className="panel-header">
            <div>
              <h2>Novo alerta de retorno</h2>
              <p>O alerta cria uma ação para a equipe; não agenda automaticamente.</p>
            </div>
          </header>
          <form className="mutation-form" onSubmit={create}>
            <label>
              Paciente
              <select name="patientId" required>
                <option value="">Selecione</option>
                {patients.map((patient) => (
                  <option key={String(patient.id)} value={String(patient.id)}>{text(patient.fullName)}</option>
                ))}
              </select>
            </label>
            <label>
              Profissional
              <select name="professionalId">
                <option value="">Sem responsável clínico</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </label>
            <label>Especialidade<input name="specialty" placeholder="Ortodontia" /></label>
            <label>Vencimento<input name="dueAt" type="datetime-local" required /></label>
            <label>
              Canal preferido
              <select name="preferredChannel" defaultValue="WHATSAPP">
                {Object.entries(channelLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="span-2">Motivo<input name="reason" placeholder="Manutenção ortodôntica" required /></label>
            <button className="button primary" disabled={busy}>Criar alerta</button>
          </form>
          {formMessage && <p className="form-success" role="status">{formMessage}</p>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </section>
      )}
      <div className="return-layout">
        <Panel
          title="Fila de contato"
          description="Ordenada por vencimento e impacto clínico"
          actions={
            <div className="segmented" role="group" aria-label="Situação do retorno">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? 'active' : ''}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
          }
        >
          <div className="filters">
            <input
              className="filter-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar paciente ou procedimento"
              aria-label="Buscar retornos"
            />
            <select
              className="filter-select"
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              aria-label="Filtrar por especialidade"
            >
              <option value="">Todas as especialidades</option>
              {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              className="filter-select"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              aria-label="Filtrar por responsável"
            >
              <option value="">Todos os responsáveis</option>
              {assignees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          {loading && <div className="state-message">Carregando retornos…</div>}
          {!loading && visible.length === 0 && (
            <EmptyState
              title="Nenhum retorno nesta fila"
              description="Ajuste os filtros ou crie um novo alerta de retorno."
            />
          )}
          {visible.length > 0 && (
            <div className="return-cards">
              {visible.map((item) => {
                const patient = nested(item, 'patient');
                const professional = nested(item, 'professional');
                const due = new Date(String(item.dueAt));
                const descriptor = dueDescriptor(item.dueAt);
                const attempts = Number(item.contactAttempts ?? 0);
                const wa = whatsappLink(patient.primaryPhone);
                const status = String(item.status);
                return (
                  <article className="return-card" key={String(item.id)}>
                    <div className={`return-date ${descriptor.tone}`}>
                      <strong>{Number.isNaN(due.getTime()) ? '--' : String(due.getDate()).padStart(2, '0')}</strong>
                      <small>{Number.isNaN(due.getTime()) ? '' : monthShort.format(due).replace('.', '').toUpperCase()}</small>
                    </div>
                    <div className="return-copy">
                      <h3>{patient.id ? <button className="text-button" type="button" onClick={() => router.push(`/pacientes/${String(patient.id)}`)}>{text(patient.fullName, 'Paciente')}</button> : text(patient.fullName, 'Paciente')}</h3>
                      <p>{text(item.reason)} · {descriptor.detail}</p>
                      <div className="return-meta">
                        <StatusBadge tone={descriptor.tone}>{descriptor.label}</StatusBadge>
                        {professional.name ? <StatusBadge tone="purple">{text(professional.name)}</StatusBadge> : null}
                        {item.specialty ? <StatusBadge tone="blue">{text(item.specialty)}</StatusBadge> : null}
                        <StatusBadge tone={attempts > 0 ? 'green' : 'gray'}>
                          {attempts > 0
                            ? `${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`
                            : `${channelLabels[String(item.preferredChannel)] ?? 'Contato'} não enviado`}
                        </StatusBadge>
                      </div>
                    </div>
                    <div className="return-actions actions-menu">
                      <button
                        className="button small"
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === String(item.id)}
                        onClick={() => setOpenMenuId((current) => current === String(item.id) ? '' : String(item.id))}
                      ><MoreHorizontal size={14} />Mais ações</button>
                      {openMenuId === String(item.id) ? (
                        <div className="actions-popover" role="menu">
                          {wa ? <a href={wa} target="_blank" rel="noreferrer" role="menuitem"><MessageCircle size={14} /> WhatsApp</a> : null}
                          {patient.id ? <button type="button" role="menuitem" onClick={() => router.push(`/pacientes/${String(patient.id)}`)}>Abrir prontuário</button> : null}
                      {status === 'PENDING' && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={() => void patch(String(item.id), { status: 'CONTACTED' }, 'Contato registrado.')}
                        >Registrar contato</button>
                      )}
                      {status !== 'DONE' && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={() => void patch(
                            String(item.id),
                            { dueAt: new Date(due.getTime() + 7 * 86400000).toISOString() },
                            'Retorno adiado em 7 dias.',
                          )}
                        >Adiar 7 dias</button>
                      )}
                      {['PENDING', 'CONTACTED'].includes(status) && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy || !patient.id}
                          onClick={() => {
                            setOpenMenuId('');
                            void patch(String(item.id), { status: 'SCHEDULED' }, 'Retorno marcado como agendado.');
                            router.push(`/agenda?patientId=${String(patient.id)}&new=1&returnId=${String(item.id)}`);
                          }}
                        >Agendar</button>
                      )}
                      {status === 'SCHEDULED' && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={() => void patch(String(item.id), { status: 'DONE' }, 'Retorno concluído.')}
                        >
                          <CheckCircle2 size={14} />Concluir
                        </button>
                      )}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>
        <div className="dashboard-stack">
          <Panel title="Eficiência de retorno" description="Últimos 30 dias">
            <div className="funnel">
              {([
                ['Retornos gerados', summary?.funnel.generated ?? 0],
                ['Contatados', summary?.funnel.contacted ?? 0],
                ['Responderam', summary?.funnel.responded ?? 0],
                ['Agendados', summary?.funnel.scheduled ?? 0],
              ] as Array<[string, number]>).map(([label, value]) => {
                const total = summary?.funnel.generated ?? 0;
                const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                return (
                  <div className="funnel-row" key={label}>
                    <span>{label}</span>
                    <div className="funnel-track">
                      <i style={{ width: `${percent}%` }} />
                    </div>
                    <strong>{value}</strong>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel
            title="Retornos por especialidade"
            description="Distribuição dos alertas em aberto"
          >
            {bySpecialty.length === 0 && <div className="state-message">Nenhum retorno em aberto.</div>}
            {bySpecialty.length > 0 && (
              <div className="billing-list">
                {bySpecialty.map(([name, total]) => (
                  <div className="billing-row" key={name}>
                    <div>
                      <strong>{name}</strong>
                      <span>{total} {total === 1 ? 'retorno em aberto' : 'retornos em aberto'}</span>
                    </div>
                    <StatusBadge tone="blue">{total}</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

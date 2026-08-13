'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import {
  currency,
  dayBounds,
  list,
  nested,
  presentationLabel,
  statusTone,
  text,
  timeOnly,
  type RecordValue,
} from '@/lib/format';
import { useAuth } from './auth-provider';
import { useSelection } from './selection-provider';
import { MetricCard, PageHeader, Panel, StatusBadge } from './ui';

export function DashboardView() {
  const { user } = useAuth();
  const { clinicId, clinics } = useSelection();
  const clinic = clinics.find((item) => item.id === clinicId);
  const [appointments, setAppointments] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    if (!clinicId) return;
    const { from, to } = dayBounds();
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}&clinicId=${clinicId}`),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`),
      api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextAppointments, nextPatients, nextReceivables]) => {
        setAppointments(list(nextAppointments));
        setPatients(list(nextPatients));
        setReceivables(list(nextReceivables));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [clinicId]);

  const confirmed = appointments.filter((item) => item.status === 'CONFIRMED').length;
  const overdue = receivables.filter((item) => item.status === 'OVERDUE');
  const pendingFinance = receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status)));
  const firstName = user?.name.split(' ')[0] ?? 'equipe';
  const todayLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date());

  return (
    <>
      <PageHeader
        title={`Bom dia, ${firstName}`}
        description={`${todayLabel} · operação consolidada${clinic ? ` de ${clinic.tradeName}` : ''}.`}
        actions={
          <>
            <Link className="button secondary" href="/retornos">Ver retornos</Link>
            <Link className="button primary" href="/agenda">＋ Novo atendimento</Link>
            <button className="button secondary" onClick={load} disabled={loading} type="button">
              <RefreshCw size={16} />Atualizar
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <section className="stats">
        <MetricCard label="Atendimentos hoje" value={appointments.length} meta={`${confirmed} confirmados`} />
        <MetricCard label="Pacientes ativos" value={patients.length} meta="Até 100 nesta consulta" />
        <MetricCard
          label="Confirmações pendentes"
          value={appointments.length - confirmed}
          meta="Agenda de hoje"
          tone="amber"
        />
        <MetricCard
          label="Recebíveis em aberto"
          value={pendingFinance.length}
          meta={overdue.length ? `${overdue.length} vencidos` : 'Sem vencidos'}
          tone={overdue.length ? 'red' : 'green'}
        />
      </section>
      <div className="dashboard-grid">
        <div className="dashboard-stack">
          <Panel
            title="Agenda de hoje"
            description={loading ? 'Carregando…' : `${appointments.length} consultas · visão operacional`}
            actions={<Link className="text-button" href="/agenda">Abrir agenda <ArrowRight size={16} /></Link>}
          >
            {appointments.length === 0 && !loading && (
              <div className="state-message">Nenhuma consulta para hoje.</div>
            )}
            <div className="agenda-list">
              {appointments.slice(0, 10).map((item) => {
                const patient = nested(item, 'patient');
                const professional = nested(item, 'professional');
                return (
                  <article className="agenda-row" key={String(item.id)}>
                    <div className="agenda-time">{timeOnly(item.startAt)}</div>
                    <div className={`timeline-node ${statusTone(item.status)}`} />
                    <div className="agenda-copy">
                      <strong>{text(patient.fullName, 'Paciente')}</strong>
                      <span>{text(item.notes, 'Consulta')} · {text(professional.name)} · {clinic?.units[0]?.name ?? 'Unidade'}</span>
                    </div>
                    <div className="agenda-side">
                      <StatusBadge tone={statusTone(item.status)}>{presentationLabel(item.status)}</StatusBadge>
                      {patient.id ? (
                        <Link className="button small" href={`/pacientes/${String(patient.id)}`}>Abrir</Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel title="Pendências operacionais" description="Atalhos para o que precisa de atenção hoje">
            <Link className="attention-item" href="/pacientes">
              <span className="attention-icon info"><AlertTriangle size={17} /></span>
              <div>
                <strong>Pacientes</strong>
                <small>{patients.length} cadastros carregados</small>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link className="attention-item sensitive" href="/financeiro">
              <span className="attention-icon warning"><AlertTriangle size={17} /></span>
              <div>
                <strong>Financeiro</strong>
                <small>
                  {pendingFinance.length} em aberto · {currency(pendingFinance.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0))}
                </small>
              </div>
              <ArrowRight size={16} />
            </Link>
            <Link className="attention-item" href="/retornos">
              <span className="attention-icon danger"><AlertTriangle size={17} /></span>
              <div>
                <strong>Central de retornos</strong>
                <small>Acompanhar retornos pendentes</small>
              </div>
              <ArrowRight size={16} />
            </Link>
          </Panel>
          <Panel title="Resumo financeiro do dia" description="Visível conforme permissão financeira" sensitive>
            <div className="info-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="info-item">
                <small>Em aberto</small>
                <strong>{currency(pendingFinance.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0))}</strong>
              </div>
              <div className="info-item">
                <small>Vencidos</small>
                <strong>{currency(overdue.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0))}</strong>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

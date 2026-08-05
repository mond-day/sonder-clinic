'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useSelection } from './selection-provider';

type Item = Record<string, unknown>;
const array = (value: unknown): Item[] => Array.isArray(value) ? value as Item[] : [];

export function DashboardView() {
  const { clinicId } = useSelection();
  const [appointments, setAppointments] = useState<Item[]>([]);
  const [patients, setPatients] = useState<Item[]>([]);
  const [report, setReport] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    if (!clinicId) return;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    setLoading(true); setError('');
    Promise.all([
      api.get<Item[]>(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}&clinicId=${clinicId}`),
      api.get<Item[]>(`/patients?clinicId=${clinicId}`),
      api.get<Record<string, unknown>>(`/reports/summary?clinicId=${clinicId}`),
    ]).then(([nextAppointments, nextPatients, nextReport]) => {
      setAppointments(nextAppointments); setPatients(nextPatients); setReport(nextReport);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [clinicId]);

  const confirmed = appointments.filter((item) => item.status === 'CONFIRMED').length;
  const financial = array(report.financial);
  const financialTotal = financial.reduce((sum, item) => sum + Number((item._sum as Item | undefined)?.netAmount ?? 0), 0);

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date()).toUpperCase()}</p><h1>Visão geral</h1><p>Acompanhe a operação da clínica com dados da API.</p></div>
        <button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={16} />Atualizar</button>
      </section>
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <section className="metrics-grid">
        <article className="metric"><div><span>Consultas hoje</span><strong>{appointments.length}</strong></div><small><b>{confirmed}</b> confirmadas</small></article>
        <article className="metric"><div><span>Pacientes ativos</span><strong>{patients.length}</strong></div><small>Até 100 nesta visão</small></article>
        <article className="metric"><div><span>Confirmações pendentes</span><strong>{appointments.length - confirmed}</strong></div><small>Agenda de hoje</small></article>
        <article className="metric"><div><span>Recebíveis</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financialTotal)}</strong></div><small>Consolidado por status</small></article>
      </section>
      <div className="dashboard-grid">
        <section className="panel schedule-panel">
          <header className="panel-header"><div><h2>Agenda de hoje</h2><p>{loading ? 'Carregando…' : `${appointments.length} consultas`}</p></div><Link className="text-button" href="/agenda">Ver agenda <ArrowRight size={16} /></Link></header>
          {appointments.length === 0 && !loading && <div className="state-message">Nenhuma consulta para hoje.</div>}
          <div className="appointment-list">{appointments.slice(0, 8).map((item) => {
            const patient = item.patient as Item | undefined;
            const professional = item.professional as Item | undefined;
            return <article className="appointment-row" key={String(item.id)}>
              <time>{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(String(item.startAt)))}</time><span className="timeline-dot" />
              <div className="appointment-main"><strong>{String(patient?.fullName ?? 'Paciente')}</strong><small>{String(item.notes ?? 'Consulta')}</small></div>
              <span className="doctor">{String(professional?.name ?? '—')}</span><span className="badge">{String(item.status)}</span>
            </article>;
          })}</div>
        </section>
        <aside className="side-stack"><section className="panel attention-panel">
          <header className="panel-header"><div><h2>Acesso rápido</h2><p>Áreas operacionais</p></div></header>
          <Link className="attention-item" href="/pacientes"><span className="attention-icon info"><AlertTriangle size={17} /></span><div><strong>Pacientes e alertas</strong><small>{patients.length} cadastros carregados</small></div><ArrowRight size={16} /></Link>
          <Link className="attention-item" href="/financeiro"><span className="attention-icon warning"><AlertTriangle size={17} /></span><div><strong>Financeiro</strong><small>{financial.length} grupos por status</small></div><ArrowRight size={16} /></Link>
          <Link className="attention-item" href="/integracoes"><span className="attention-icon info"><AlertTriangle size={17} /></span><div><strong>Configurações</strong><small>Integrações e identidade</small></div><ArrowRight size={16} /></Link>
        </section></aside>
      </div>
    </>
  );
}

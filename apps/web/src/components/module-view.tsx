'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  currency,
  dateTime,
  dayBounds,
  list,
  nested,
  presentationLabel,
  statusTone,
  text,
  type RecordValue,
} from '@/lib/format';
import { AgendaView } from './agenda-view';
import { FinanceView } from './finance-view';
import { LabView } from './lab-view';
import { ModuleActions } from './module-actions';
import { PatientsBrowser } from './patients-browser';
import { ReportsView } from './reports-view';
import { ReturnsView } from './returns-view';
import { useSelection } from './selection-provider';
import { SettingsView } from './settings-view';
import { TasksView } from './tasks-view';
import { UsersView } from './users-view';
import { EmptyState, PageHeader, Panel, StatusBadge } from './ui';

type ModuleKey =
  | 'agenda'
  | 'pacientes'
  | 'tratamentos'
  | 'documentos'
  | 'financeiro'
  | 'comissoes'
  | 'comunicacao'
  | 'integracoes'
  | 'configuracoes'
  | 'relatorios'
  | 'retornos'
  | 'tarefas'
  | 'laboratorio'
  | 'usuarios';

/** Módulos com tela dedicada; os demais caem no renderizador tabular genérico. */
type GenericModuleKey = Exclude<
  ModuleKey,
  'agenda' | 'pacientes' | 'financeiro' | 'retornos' | 'tarefas' | 'laboratorio' | 'configuracoes' | 'integracoes' | 'relatorios' | 'usuarios'
>;

type ViewData = { columns: string[]; rows: string[][]; metrics: Array<[string, string, string]> };

const metadata: Record<ModuleKey, { name: string; description: string }> = {
  agenda: { name: 'Agenda', description: 'Consultas por profissional e cadeira, com conflitos validados no servidor.' },
  pacientes: { name: 'Pacientes', description: 'Cadastros, alertas clínicos e vínculos com responsáveis.' },
  tratamentos: { name: 'Tratamentos e prontuário', description: 'Planos, evoluções clínicas e odontogramas do paciente selecionado.' },
  documentos: { name: 'Documentos', description: 'Modelos, documentos gerados e assinaturas imutáveis.' },
  financeiro: { name: 'Financeiro', description: 'Recebíveis, pagamentos, estornos e conciliação.' },
  comissoes: { name: 'Comissões', description: 'Regras versionadas e eventos por competência.' },
  comunicacao: { name: 'Comunicação', description: 'Entregas por canal e situação operacional.' },
  integracoes: { name: 'Configurações e integrações', description: 'Conexões, branding e documentos legais da clínica.' },
  configuracoes: { name: 'Configurações', description: 'Unidades, procedimentos, automações, integrações e preferências.' },
  relatorios: { name: 'Relatórios', description: 'Indicadores clínicos, operacionais e financeiros consolidados.' },
  retornos: { name: 'Central de retornos', description: 'Alertas clínicos de retorno e reagendamento.' },
  tarefas: { name: 'Tarefas', description: 'Atividades da equipe com prazo e responsável.' },
  laboratorio: { name: 'Laboratório & casos', description: 'Controle de prótese, ortodontia e implantodontia.' },
  usuarios: { name: 'Usuários e permissões', description: 'Equipe, convites, perfis e matriz RBAC.' },
};

async function loadModule(module: GenericModuleKey, clinicId: string, patientId: string, reportFrom?: string, reportTo?: string): Promise<ViewData> {
  if (module === 'tratamentos') {
    const planQuery = new URLSearchParams({ clinicId });
    if (patientId) planQuery.set('patientId', patientId);
    const [plansRaw, patientsRaw] = await Promise.all([api.get(`/treatment-plans?${planQuery}`), api.get(`/patients?clinicId=${clinicId}`)]);
    const plans = list(plansRaw);
    const patients = list(patientsRaw);
    const patient = patients.find((item) => item.id === patientId);
    let clinicalEntries: RecordValue[] = [];
    let odontograms: RecordValue[] = [];
    if (patient?.id) {
      const [record, odontogramData] = await Promise.all([
        api.get<{ entries?: RecordValue[] }>(`/patients/${patient.id}/clinical-record?clinicId=${clinicId}`),
        api.get(`/patients/${patient.id}/odontograms`),
      ]);
      clinicalEntries = list(record.entries);
      odontograms = list(odontogramData);
    }
    return {
      columns: ['Plano', 'Total', 'Itens', 'Status'],
      rows: plans.map((item) => [text(item.title), currency(item.total), String(list(item.items).length), presentationLabel(item.status)]),
      metrics: [['Planos', String(plans.length), 'Todos os pacientes'], ['Evoluções', String(clinicalEntries.length), patient ? `Paciente: ${text(patient.fullName)}` : 'Nenhum paciente'], ['Odontogramas', String(odontograms.length), 'Histórico do paciente']],
    };
  }
  if (module === 'documentos') {
    const [templatesRaw, documentsRaw] = await Promise.all([api.get('/document-templates'), api.get(`/documents?clinicId=${clinicId}`)]);
    const templates = list(templatesRaw);
    const documents = list(documentsRaw).filter((item) => !patientId || item.patientId === patientId);
    return {
      columns: ['Documento/modelo', 'Tipo', 'Versão', 'Status'],
      rows: [...documents.map((item) => [text(item.validationCode), 'Gerado', text(item.templateVersion), presentationLabel(item.status)]), ...templates.map((item) => [text(item.name), presentationLabel(item.type), text(item.version), 'Modelo'])],
      metrics: [['Gerados', String(documents.length), 'Documentos congelados'], ['Assinados', String(documents.filter((item) => item.status === 'SIGNED').length), 'Imutáveis'], ['Modelos ativos', String(templates.length), 'Disponíveis para geração']],
    };
  }
  if (module === 'comissoes') {
    const rows = list(await api.get('/commission-rules'));
    return {
      columns: ['Base', 'Cálculo', 'Valor', 'Vigência'],
      rows: rows.map((item) => [presentationLabel(item.basis), presentationLabel(item.calculationType), text(item.value), dateTime(item.validFrom)]),
      metrics: [['Regras ativas', String(rows.length), 'Ordenadas por prioridade'], ['Percentuais', String(rows.filter((item) => item.calculationType === 'PERCENTAGE').length), 'Cálculo proporcional'], ['Fixas', String(rows.filter((item) => item.calculationType === 'FIXED').length), 'Valor fixo']],
    };
  }
  if (module === 'comunicacao') {
    const rows = list(await api.get('/communication/deliveries'));
    return {
      columns: ['Destino', 'Canal', 'Categoria', 'Status'],
      rows: rows.map((item) => [text(item.destinationMasked), presentationLabel(item.channel), presentationLabel(item.category), presentationLabel(item.status)]),
      metrics: [['Entregas', String(rows.length), 'Últimos 200 registros'], ['Concluídas', String(rows.filter((item) => item.status === 'DELIVERED').length), 'Confirmadas pelo provedor'], ['Falhas', String(rows.filter((item) => item.status === 'FAILED').length), 'Reprocessáveis']],
    };
  }
  const reportQuery = new URLSearchParams({ clinicId });
  if (reportFrom) reportQuery.set('from', reportFrom);
  if (reportTo) reportQuery.set('to', reportTo);
  const report = await api.get<Record<string, unknown>>(`/reports/summary?${reportQuery}`);
  const agenda = nested(report, 'agenda');
  const patients = nested(report, 'patients');
  const financial = nested(report, 'financial');
  const rows = [
    ...list(agenda.byStatus).map((item) => ['Agenda', presentationLabel(item.status), text(item.count), '—']),
    ...list(agenda.byProfessional).map((item) => [`Agenda · ${text(item.professional)}`, `Ocupação ${text(item.occupancyRate)}%`, `${text(item.completed)} concluídos de ${text(item.scheduled)}`, '—']),
    ...list(financial.byStatus).map((item) => ['Financeiro', presentationLabel(item.status), text(item._count), currency(nested(item, '_sum').netAmount)]),
    ...list(report.treatments).map((item) => ['Tratamentos', presentationLabel(item.status), text(item._count), currency(nested(item, '_sum').total)]),
    ...list(report.commissions).map((item) => [`Comissão · ${text(item.professional)}`, presentationLabel(item.status), `${text(item.percentage)}%`, currency(item.amount)]),
    ...list(report.communication).map((item) => ['Comunicação', presentationLabel(item.status), text(item._count), '—']),
  ];
  return {
    columns: ['Área', 'Status', 'Quantidade', 'Total'],
    rows,
    metrics: [
      ['Agendamentos', String(list(agenda.byStatus).reduce((sum, item) => sum + Number(item.count ?? 0), 0)), 'Período selecionado'],
      ['Pacientes novos', text(patients.new), `${text(patients.active)} ativos`],
      ['Retornos pendentes', text(patients.pendingReturns), `${text(patients.inactive)} inativos`],
    ],
  };
}

export function ModuleView({ module }: { module: string }) {
  const key = (module in metadata ? module : 'tratamentos') as ModuleKey;

  if (key === 'agenda') return <AgendaView />;
  if (key === 'pacientes') {
    return (
      <Suspense fallback={<div className="state-message">Carregando pacientes…</div>}>
        <PatientsBrowser />
      </Suspense>
    );
  }
  if (key === 'financeiro') return <FinanceView />;
  if (key === 'retornos') return <ReturnsView />;
  if (key === 'tarefas') return <TasksView />;
  if (key === 'laboratorio') return <LabView />;
  if (key === 'configuracoes' || key === 'integracoes') return <SettingsView />;
  if (key === 'relatorios') return <ReportsView />;
  if (key === 'usuarios') return <UsersView />;

  return <GenericModuleView moduleKey={key} />;
}

function GenericModuleView({ moduleKey: key }: { moduleKey: GenericModuleKey }) {
  const info = metadata[key];
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [selectedPatientId, setSelectedPatientIdState] = useState('');
  const [reportFrom, setReportFrom] = useState(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { clinicId, clinics, professionals } = useSelection();
  const setSelectedPatientId = useCallback((value: string) => {
    setSelectedPatientIdState(value);
    if (value) window.localStorage.setItem('sonder.selectedPatientId', value);
    else window.localStorage.removeItem('sonder.selectedPatientId');
  }, []);
  const loadPatients = useCallback(() => {
    if (!clinicId) return;
    api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).then((items) => {
      setPatients(items);
      const stored = window.localStorage.getItem('sonder.selectedPatientId');
      const selected = items.some((item) => item.id === stored) ? stored! : '';
      setSelectedPatientIdState(selected);
    }).catch(() => setPatients([]));
  }, [clinicId]);
  useEffect(loadPatients, [loadPatients]);
  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true); setError('');
    loadModule(key, clinicId, selectedPatientId, reportFrom, reportTo).then(setData).catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os dados.')).finally(() => setLoading(false));
  }, [key, clinicId, selectedPatientId, reportFrom, reportTo]);
  useEffect(load, [load]);
  const empty = useMemo(() => !loading && !error && data?.rows.length === 0, [loading, error, data]);

  return (
    <>
      <PageHeader
        title={info.name}
        description={info.description}
        eyebrow="OPERAÇÃO CLÍNICA"
        actions={
          <button className="button secondary" onClick={load} disabled={loading} type="button">
            <RefreshCw size={16} />Atualizar
          </button>
        }
      />
      {data && (
        <section className="module-metrics">
          {data.metrics.map(([label, value, detail]) => (
            <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
          ))}
        </section>
      )}
      <ModuleActions
        module={key}
        clinicId={clinicId}
        clinics={clinics}
        professionals={professionals}
        patients={patients}
        selectedPatientId={selectedPatientId}
        onPatientChange={setSelectedPatientId}
        onSaved={() => { loadPatients(); load(); }}
      />
      {key === 'tratamentos' && selectedPatientId && (
        <div className="secure-notice">
          <div>
            <strong>Prontuário dedicado disponível</strong>
            <span>Abra a ficha isolada sem lista de outros pacientes.</span>
          </div>
          <Link className="button small primary" href={`/pacientes/${selectedPatientId}`}>Abrir prontuário</Link>
        </div>
      )}
      <Panel title="Dados operacionais" description="Fonte: API autenticada da organização atual." actions={<ArrowRight size={15} />}>
        {loading && <div className="state-message">Carregando dados…</div>}
        {error && <div className="state-message error" role="alert">{error}<button className="text-button" type="button" onClick={load}>Tentar novamente</button></div>}
        {empty && <EmptyState title="Nenhum registro encontrado." />}
        {data && data.rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((row, rowIndex) => (
                  <tr key={`${rowIndex}-${row.join()}`}>
                    {row.map((cell, index) => (
                      <td key={`${index}-${cell}`}>
                        {index === row.length - 1 ? <StatusBadge tone={statusTone(cell)}>{cell}</StatusBadge> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

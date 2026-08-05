'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';

type ModuleKey = 'agenda' | 'pacientes' | 'tratamentos' | 'documentos' | 'financeiro' | 'comissoes' | 'comunicacao' | 'integracoes' | 'relatorios';
type RecordValue = Record<string, unknown>;
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
  relatorios: { name: 'Relatórios', description: 'Indicadores clínicos, operacionais e financeiros consolidados.' },
};

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
const date = (value: unknown) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(value))) : '—';
const currency = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value as RecordValue[] : [];
const nested = (item: RecordValue, key: string): RecordValue => (item[key] && typeof item[key] === 'object' ? item[key] : {}) as RecordValue;

async function loadModule(module: ModuleKey, clinicId: string, patientId: string): Promise<ViewData> {
  if (module === 'pacientes') {
    const rows = list(await api.get(`/patients?clinicId=${clinicId}`));
    return {
      columns: ['Paciente', 'Contato', 'Alertas', 'Situação'],
      rows: rows.map((item) => [text(item.fullName), text(item.primaryPhone), String(list(item.alerts).length), text(item.status)]),
      metrics: [['Pacientes ativos', String(rows.length), 'Limite de 100 por consulta'], ['Com alertas', String(rows.filter((item) => list(item.alerts).length).length), 'Alertas clínicos ativos'], ['Menores', String(rows.filter((item) => item.isMinor).length), 'Responsável obrigatório']],
    };
  }
  if (module === 'agenda') {
    const now = new Date();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const rows = list(await api.get(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}&clinicId=${clinicId}`));
    const confirmed = rows.filter((item) => item.status === 'CONFIRMED').length;
    return {
      columns: ['Horário', 'Paciente', 'Profissional', 'Status'],
      rows: rows.map((item) => [date(item.startAt), text(nested(item, 'patient').fullName), text(nested(item, 'professional').name), text(item.status)]),
      metrics: [['Consultas hoje', String(rows.length), `${confirmed} confirmadas`], ['Pendentes', String(rows.length - confirmed), 'Acompanhar confirmações'], ['Conflitos', '0', 'Validados pela API']],
    };
  }
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
      rows: plans.map((item) => [text(item.title), currency(item.total), String(list(item.items).length), text(item.status)]),
      metrics: [['Planos', String(plans.length), 'Todos os pacientes'], ['Evoluções', String(clinicalEntries.length), patient ? `Paciente: ${text(patient.fullName)}` : 'Nenhum paciente'], ['Odontogramas', String(odontograms.length), 'Histórico do paciente']],
    };
  }
  if (module === 'documentos') {
    const [templatesRaw, documentsRaw] = await Promise.all([api.get('/document-templates'), api.get(`/documents?clinicId=${clinicId}`)]);
    const templates = list(templatesRaw);
    const documents = list(documentsRaw).filter((item) => !patientId || item.patientId === patientId);
    return {
      columns: ['Documento/modelo', 'Tipo', 'Versão', 'Status'],
      rows: [...documents.map((item) => [text(item.validationCode), 'Gerado', text(item.templateVersion), text(item.status)]), ...templates.map((item) => [text(item.name), text(item.type), text(item.version), 'MODELO'])],
      metrics: [['Gerados', String(documents.length), 'Documentos congelados'], ['Assinados', String(documents.filter((item) => item.status === 'SIGNED').length), 'Imutáveis'], ['Modelos ativos', String(templates.length), 'Disponíveis para geração']],
    };
  }
  if (module === 'financeiro') {
    const rows = list(await api.get(`/receivables?clinicId=${clinicId}`));
    const total = rows.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0);
    return {
      columns: ['Descrição', 'Vencimento', 'Valor', 'Status'],
      rows: rows.map((item) => [text(item.description), date(item.dueDate), currency(item.netAmount), text(item.status)]),
      metrics: [['Recebíveis', String(rows.length), 'Registros encontrados'], ['Valor líquido', currency(total), 'Total da consulta'], ['Vencidos', String(rows.filter((item) => item.status === 'OVERDUE').length), 'Requer atenção']],
    };
  }
  if (module === 'comissoes') {
    const rows = list(await api.get('/commission-rules'));
    return {
      columns: ['Base', 'Cálculo', 'Valor', 'Vigência'],
      rows: rows.map((item) => [text(item.basis), text(item.calculationType), text(item.value), date(item.validFrom)]),
      metrics: [['Regras ativas', String(rows.length), 'Ordenadas por prioridade'], ['Percentuais', String(rows.filter((item) => item.calculationType === 'PERCENTAGE').length), 'Cálculo proporcional'], ['Fixas', String(rows.filter((item) => item.calculationType === 'FIXED').length), 'Valor fixo']],
    };
  }
  if (module === 'comunicacao') {
    const rows = list(await api.get('/communication/deliveries'));
    return {
      columns: ['Destino', 'Canal', 'Categoria', 'Status'],
      rows: rows.map((item) => [text(item.destinationMasked), text(item.channel), text(item.category), text(item.status)]),
      metrics: [['Entregas', String(rows.length), 'Últimos 200 registros'], ['Concluídas', String(rows.filter((item) => item.status === 'DELIVERED').length), 'Confirmadas pelo provedor'], ['Falhas', String(rows.filter((item) => item.status === 'FAILED').length), 'Reprocessáveis']],
    };
  }
  if (module === 'integracoes') {
    const [connections, branding, legal] = await Promise.all([
      api.get<{ configured: RecordValue[]; bootstrap: RecordValue[] }>('/integrations'),
      api.get<RecordValue>(`/settings/branding?clinicId=${clinicId}`),
      api.get(`/settings/legal?clinicId=${clinicId}`),
    ]);
    const rows = [...connections.configured, ...connections.bootstrap];
    return {
      columns: ['Provedor', 'Origem/escopo', 'Modo', 'Status'],
      rows: rows.map((item) => [text(item.provider), text(item.scopeType ?? item.source), text(item.mode ?? 'persistido'), text(item.status)]),
      metrics: [['Conexões', String(connections.configured.length), 'Credenciais persistidas'], ['Branding', text(branding.name), text(branding.source)], ['Documentos legais', String(list(legal).length), 'Versionados por clínica']],
    };
  }
  const report = await api.get<Record<string, unknown>>(`/reports/summary?clinicId=${clinicId}`);
  const groups = ['appointments', 'financial', 'commissions', 'communication'];
  const rows = groups.flatMap((group) => list(report[group]).map((item) => [group, text(item.status), text(nested(item, '_count')._all ?? item._count), text(nested(item, '_sum').netAmount ?? nested(item, '_sum').amount)]));
  return {
    columns: ['Área', 'Status', 'Quantidade', 'Total'],
    rows,
    metrics: [['Agendamentos', String(list(report.appointments).reduce((sum, item) => sum + Number(item._count ?? 0), 0)), 'Consolidado'], ['Financeiro', String(list(report.financial).length), 'Grupos por status'], ['Comunicação', String(list(report.communication).length), 'Grupos por status']],
  };
}

export function ModuleView({ module }: { module: string }) {
  const key = (module in metadata ? module : 'tratamentos') as ModuleKey;
  const info = metadata[key];
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [selectedPatientId, setSelectedPatientIdState] = useState('');
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
    loadModule(key, clinicId, selectedPatientId).then(setData).catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os dados.')).finally(() => setLoading(false));
  }, [key, clinicId, selectedPatientId]);
  useEffect(load, [load]);
  const empty = useMemo(() => !loading && !error && data?.rows.length === 0, [loading, error, data]);

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">OPERAÇÃO CLÍNICA</p><h1>{info.name}</h1><p>{info.description}</p></div>
        <button className="button secondary" onClick={load} disabled={loading}><RefreshCw size={16} />Atualizar</button>
      </section>
      {data && <section className="module-metrics">{data.metrics.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>}
      {key === 'integracoes' && <div className="secure-notice"><ShieldCheck size={18} /><div><strong>Segredos protegidos</strong><span>Credenciais são mascaradas e alterações são auditadas.</span></div></div>}
      <ModuleActions module={key} clinicId={clinicId} clinics={clinics} professionals={professionals} patients={patients} selectedPatientId={selectedPatientId} onPatientChange={setSelectedPatientId} onSaved={() => { loadPatients(); load(); }} />
      <section className="panel data-panel">
        <header className="panel-header"><div><h2>Dados operacionais</h2><p>Fonte: API autenticada da organização atual.</p></div><ArrowRight size={15} /></header>
        {loading && <div className="state-message">Carregando dados…</div>}
        {error && <div className="state-message error" role="alert">{error}<button className="text-button" onClick={load}>Tentar novamente</button></div>}
        {empty && <div className="state-message">Nenhum registro encontrado.</div>}
        {data && data.rows.length > 0 && <div className="table-wrap"><table><thead><tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.rows.map((row, rowIndex) => <tr key={`${rowIndex}-${row.join()}`}>{row.map((cell, index) => <td key={`${index}-${cell}`}>{index === row.length - 1 ? <span className="badge">{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div>}
      </section>
    </>
  );
}

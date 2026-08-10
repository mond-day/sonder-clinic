'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { currency, dateOnly, list, number, presentationLabel, text, type RecordValue } from '@/lib/format';
import {
  isTechnicalIdKey,
  presentationFor,
  resolveColumns,
  type ReportColumnDefinition,
  type ReportFilterKey,
} from '@/lib/report-presentation';
import { useSelection } from './selection-provider';
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton, StatusBadge } from './ui';

type CatalogItem = {
  id: string;
  name: string;
  domain: string;
  permission: string;
};

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'year', label: 'Ano' },
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  clinical: 'Clínico',
  financial: 'Financeiro',
  management: 'Gestão',
  operational: 'Operacional',
  operations: 'Operacional',
  admin: 'Administrativo',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'OVERDUE', label: 'Vencido' },
  { value: 'PAID', label: 'Pago' },
  { value: 'PARTIALLY_PAID', label: 'Parcialmente pago' },
];

function domainLabel(domain: string) {
  return DOMAIN_LABELS[domain.toLowerCase()] ?? domain;
}

function domainTone(domain: string): 'amber' | 'green' | 'blue' | 'gray' {
  const key = domain.toLowerCase();
  if (key === 'financial') return 'amber';
  if (key === 'clinical') return 'green';
  if (key === 'management') return 'blue';
  return 'gray';
}

function formatCell(column: ReportColumnDefinition, value: unknown) {
  if (value == null || value === '') return '—';
  if (isTechnicalIdKey(column.key) || /^[0-9a-f-]{36}$/i.test(String(value))) return '—';
  switch (column.type) {
    case 'currency':
      return currency(value);
    case 'integer':
      return number(value, { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    case 'date':
      return dateOnly(value);
    case 'status':
      return presentationLabel(value);
    default:
      return text(value);
  }
}

function computeSummaries(
  rows: RecordValue[],
  presentation: ReturnType<typeof presentationFor>,
) {
  const defs = presentation.summaries ?? [];
  return defs.slice(0, 3).map((def) => {
    if (def.aggregate === 'count') {
      return { label: def.label, value: number(rows.length, { maximumFractionDigits: 0 }) };
    }
    const key = def.sourceKey ?? def.key;
    const values = rows
      .map((row) => Number(row[key]))
      .filter((n) => !Number.isNaN(n));
    if (!values.length) {
      return { label: def.label, value: def.type === 'currency' ? currency(0) : '—' };
    }
    const total = values.reduce((sum, n) => sum + n, 0);
    if (def.aggregate === 'avg') {
      const avg = total / values.length;
      return { label: def.label, value: def.type === 'currency' ? currency(avg) : number(avg) };
    }
    return { label: def.label, value: def.type === 'currency' ? currency(total) : number(total, { maximumFractionDigits: 0 }) };
  });
}

function chartRows(rows: RecordValue[], labelKey: string, valueKey: string, limit = 6) {
  const items = rows
    .map((row) => ({
      label: text(row[labelKey] ?? row.procedureName ?? row.professional ?? row.patient, '—'),
      value: Number(row[valueKey] ?? row.total ?? row.clinicalProduction ?? row.netReceipt ?? 0),
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const max = items[0]?.value ?? 1;
  return items.map((item) => ({
    ...item,
    width: Math.max(8, Math.round((item.value / max) * 100)),
    display: currency(item.value),
  }));
}

export function ReportsView() {
  const { clinicId, clinics, professionals } = useSelection();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<string>('production-professional');
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [filterClinicId, setFilterClinicId] = useState('');
  const [filterProfessionalId, setFilterProfessionalId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [chartHidden, setChartHidden] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const presentation = useMemo(() => presentationFor(selected), [selected]);
  const columns = useMemo(() => resolveColumns(presentation, rows), [presentation, rows]);
  const summaries = useMemo(() => computeSummaries(rows, presentation), [rows, presentation]);
  const selectedReport = catalog.find((item) => item.id === selected);
  const effectiveClinicId = filterClinicId || clinicId || '';

  const bounds = useCallback(() => {
    const to = new Date();
    const from = new Date();
    if (period === 'today') from.setHours(0, 0, 0, 0);
    else if (period === '7d') from.setDate(from.getDate() - 7);
    else if (period === '90d') from.setDate(from.getDate() - 90);
    else if (period === 'year') from.setMonth(0, 1);
    else from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [period]);

  const catalogByDomain = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = new Map<string, CatalogItem[]>();
    for (const item of catalog) {
      if (q && !item.name.toLowerCase().includes(q)) continue;
      const key = item.domain || 'other';
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }
    const order = ['clinical', 'financial', 'management', 'operational', 'operations', 'admin', 'other'];
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = order.indexOf(a.toLowerCase());
      const bi = order.indexOf(b.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [catalog, search]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (filterStatus) {
      result = result.filter((row) => String(row.status ?? row.effectiveStatus ?? '').toUpperCase() === filterStatus);
    }
    if (filterPatient.trim()) {
      const q = filterPatient.trim().toLowerCase();
      result = result.filter((row) => String(row.patient ?? row.fullName ?? '').toLowerCase().includes(q));
    }
    if (filterProfessionalId) {
      result = result.filter((row) => String(row.professionalId ?? '') === filterProfessionalId);
    }
    return result;
  }, [rows, filterStatus, filterPatient, filterProfessionalId]);

  const chartData = useMemo(() => {
    if (!presentation.chart?.enabled || chartHidden) return [];
    return chartRows(filteredRows, presentation.chart.labelKey, presentation.chart.valueKey);
  }, [filteredRows, presentation.chart, chartHidden]);

  useEffect(() => {
    setLoading(true);
    api.get<CatalogItem[]>('/reports/catalog')
      .then((data) => {
        const items = Array.isArray(data) ? data : list(data) as CatalogItem[];
        setCatalog(items);
        setSelected((current) => (items.some((item) => item.id === current) ? current : (items[0]?.id ?? current)));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar catálogo.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [exportOpen]);

  const run = useCallback(async (format: 'json' | 'csv' | 'xlsx' | 'pdf' = 'json') => {
    if (!effectiveClinicId || !selected) return;
    setRunning(true);
    setError(null);
    try {
      const { from, to } = bounds();
      const query = new URLSearchParams({ clinicId: effectiveClinicId, from, to, format });
      if (format === 'json') {
        const result = await api.get<{ rows: RecordValue[]; total: number }>(`/reports/by/${selected}?${query}`);
        setRows(list(result.rows ?? result));
      } else {
        const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
        const response = await fetch(`${API_URL}/reports/by/${selected}?${query}`, { credentials: 'include' });
        if (!response.ok) throw new ApiError('Falha na exportação.', response.status);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const extension = format === 'pdf' ? 'pdf' : format === 'xlsx' ? 'xlsx' : 'csv';
        const safeName = (selectedReport?.name ?? selected).replace(/\s+/g, '-').toLowerCase();
        anchor.download = `${safeName}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
        setExportOpen(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao executar relatório.');
    } finally {
      setRunning(false);
    }
  }, [bounds, effectiveClinicId, selected, selectedReport?.name]);

  useEffect(() => {
    if (!effectiveClinicId || !selected || loading) return;
    const timer = window.setTimeout(() => { void run('json'); }, 350);
    return () => window.clearTimeout(timer);
  }, [effectiveClinicId, selected, period, loading, run]);

  function renderFilter(key: ReportFilterKey) {
    switch (key) {
      case 'period':
        return (
          <label key="period" className="field">
            <span>Período</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        );
      case 'clinic':
        return (
          <label key="clinic" className="field">
            <span>Unidade</span>
            <select value={filterClinicId || clinicId || ''} onChange={(e) => setFilterClinicId(e.target.value)}>
              {clinics.map((item) => <option key={item.id} value={item.id}>{item.tradeName}</option>)}
            </select>
          </label>
        );
      case 'professional':
        return (
          <label key="professional" className="field">
            <span>Profissional</span>
            <select value={filterProfessionalId} onChange={(e) => setFilterProfessionalId(e.target.value)}>
              <option value="">Todos os profissionais</option>
              {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        );
      case 'status':
        return (
          <label key="status" className="field">
            <span>Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              {STATUS_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        );
      case 'patient':
        return (
          <label key="patient" className="field search">
            <span>Paciente</span>
            <input placeholder="Buscar paciente…" value={filterPatient} onChange={(e) => setFilterPatient(e.target.value)} />
          </label>
        );
      default:
        return null;
    }
  }

  if (loading) return <Skeleton rows={5} />;

  return (
    <div className="reports-view">
      <PageHeader
        eyebrow="Gestão"
        title="Relatórios"
        description="Escolha uma análise, ajuste filtros e consulte dados apresentados em linguagem de negócio."
      />
      {error ? <ErrorState description={error} onRetry={() => void run()} /> : null}
      <div className="reports-layout report-shell">
        <Panel title="Biblioteca" description="Catálogo compacto por domínio">
          <label className="field">
            <span className="sr-only">Buscar relatório</span>
            <input placeholder="Buscar relatório…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="report-catalog report-library">
            {catalogByDomain.map(([domain, items]) => (
              <div key={domain} className="report-domain-group">
                <small className="report-domain-label">{domainLabel(domain)}</small>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`report-item ${selected === item.id ? 'active' : ''}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <span>{presentationFor(item.id).description.slice(0, 90)}{presentationFor(item.id).description.length > 90 ? '…' : ''}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={selectedReport?.name ?? 'Análise'}
          description={presentation.description}
          actions={(
            <div className="heading-actions" style={{ marginLeft: 0 }}>
              <div className="dropdown" ref={exportRef}>
                <button type="button" className="button soft small" disabled={running} onClick={() => setExportOpen((v) => !v)}>
                  Exportar <ChevronDown size={14} />
                </button>
                {exportOpen ? (
                  <div className="menu open" role="menu">
                    <button type="button" role="menuitem" onClick={() => void run('xlsx')}>Excel (.xlsx)</button>
                    <button type="button" role="menuitem" onClick={() => void run('pdf')}>PDF</button>
                    <button type="button" role="menuitem" onClick={() => void run('csv')}>CSV</button>
                  </div>
                ) : null}
              </div>
              <button type="button" className="button primary small" disabled={running} onClick={() => void run('json')}>
                {running ? 'Atualizando…' : 'Aplicar filtros'}
              </button>
            </div>
          )}
        >
          <div className="report-titlebar">
            <div>
              <small className="eyebrow">{domainLabel(selectedReport?.domain ?? 'clinical')}</small>
            </div>
          </div>
          <div className="report-filterbar filters">
            {presentation.filters.map((key) => renderFilter(key))}
          </div>
          {summaries.length ? (
            <div className="report-kpis">
              {summaries.map((kpi) => (
                <div key={kpi.label} className="report-kpi">
                  <span>{kpi.label}</span>
                  <strong>{kpi.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {chartData.length ? (
            <div className="chartbox">
              <div className="chart">
                <div className="chart-head">
                  <div>
                    <strong>Visão rápida</strong>
                    <p className="muted-note">Resumo visual do período selecionado</p>
                  </div>
                  <button type="button" className="button ghost small" onClick={() => setChartHidden((v) => !v)}>
                    {chartHidden ? 'Mostrar gráfico' : 'Ocultar gráfico'}
                  </button>
                </div>
                {!chartHidden ? (
                  <div className="bars">
                    {chartData.map((bar) => (
                      <div key={bar.label} className="barrow">
                        <span>{bar.label}</span>
                        <div className="bartrack"><div className="barfill" style={{ width: `${bar.width}%` }} /></div>
                        <strong>{bar.display}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="report-table-section">
            <div className="report-table-head">
              <strong>Detalhamento</strong>
              <span className="muted-note">{filteredRows.length} resultado(s)</span>
            </div>
            {filteredRows.length ? (
              <div className="table-wrap report-table-wrap">
                <table className="data-table report-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} className={column.align === 'right' ? 'align-right' : undefined}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 100).map((row, index) => (
                      <tr key={index}>
                        {columns.map((column) => {
                          const raw = row[column.key];
                          const formatted = formatCell(column, raw);
                          if (column.type === 'status') {
                            return (
                              <td key={column.key}>
                                <StatusBadge tone={String(raw).includes('OVERDUE') || String(raw).includes('Vencido') ? 'red' : 'green'}>
                                  {formatted}
                                </StatusBadge>
                              </td>
                            );
                          }
                          return (
                            <td key={column.key} className={column.align === 'right' ? 'align-right' : undefined}>
                              {formatted}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={running ? 'Carregando…' : 'Sem dados no período'}
                description="Ajuste os filtros ou escolha outro relatório na biblioteca."
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

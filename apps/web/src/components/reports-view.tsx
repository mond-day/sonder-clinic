'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { currency, dateOnly, list, number, presentationLabel, text, type RecordValue } from '@/lib/format';
import { printHtmlDocument, escapePrintHtml } from '@/lib/print-document';
import {
  isTechnicalIdKey,
  presentationFor,
  resolveColumns,
  type ReportColumnDefinition,
  type ReportFilterKey,
} from '@/lib/report-presentation';
import { useSelection } from './selection-provider';
import { EmptyState, ErrorState, PageHeader, Panel, Skeleton, StatusBadge } from './ui';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

type CatalogItem = {
  id: string;
  name: string;
  domain: string;
  permission: string;
};

const PERIODS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'year', label: 'Este ano' },
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

const MAIN_FILTERS: ReportFilterKey[] = ['period', 'clinic'];

function domainLabel(domain: string) {
  return DOMAIN_LABELS[domain.toLowerCase()] ?? domain;
}

function domainTone(domain: string): 'teal' | 'amber' | 'blue' | 'gray' {
  const key = domain.toLowerCase();
  if (key === 'financial') return 'amber';
  if (key === 'clinical') return 'teal';
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
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');
  const [filterClinicId, setFilterClinicId] = useState('');
  const [filterProfessionalId, setFilterProfessionalId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [chartHidden, setChartHidden] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const presentation = useMemo(() => presentationFor(selected), [selected]);
  const columns = useMemo(() => resolveColumns(presentation, rows), [presentation, rows]);
  const summaries = useMemo(() => computeSummaries(rows, presentation), [rows, presentation]);
  const selectedReport = catalog.find((item) => item.id === selected);
  const effectiveClinicId = filterClinicId || clinicId || '';
  const mainFilters = presentation.filters.filter((key) => MAIN_FILTERS.includes(key));
  const additionalFilters = presentation.filters.filter((key) => !MAIN_FILTERS.includes(key));

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

  const reportOptions = useMemo(() => {
    return [...catalog]
      .sort((a, b) => {
        const domainCmp = domainLabel(a.domain).localeCompare(domainLabel(b.domain), 'pt-BR');
        if (domainCmp !== 0) return domainCmp;
        return a.name.localeCompare(b.name, 'pt-BR');
      })
      .map((item) => ({
        value: item.id,
        label: item.name,
        description: presentationFor(item.id).description,
        badge: domainLabel(item.domain),
        badgeTone: domainTone(item.domain),
      }));
  }, [catalog]);

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
    if (!presentation.chart?.enabled) return [];
    return chartRows(filteredRows, presentation.chart.labelKey, presentation.chart.valueKey);
  }, [filteredRows, presentation.chart]);

  const previewChips = useMemo(() => {
    const chips: string[] = [];
    chips.push(PERIODS.find((item) => item.id === period)?.label ?? period);
    const clinicName = clinics.find((item) => item.id === effectiveClinicId)?.tradeName;
    if (clinicName) chips.push(clinicName);
    if (filterProfessionalId) {
      const name = professionals.find((item) => item.id === filterProfessionalId)?.name;
      if (name) chips.push(name);
    }
    if (filterStatus) {
      chips.push(STATUS_OPTIONS.find((item) => item.value === filterStatus)?.label ?? filterStatus);
    }
    if (filterPatient.trim()) chips.push(`Paciente: ${filterPatient.trim()}`);
    return chips;
  }, [period, clinics, effectiveClinicId, filterProfessionalId, professionals, filterStatus, filterPatient]);

  useEffect(() => {
    setLoading(true);
    api.get<CatalogItem[]>('/reports/catalog')
      .then((data) => {
        const items = Array.isArray(data) ? data : list(data) as CatalogItem[];
        setCatalog(items);
        setSelected((current) => (items.some((item) => item.id === current) ? current : ''));
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

  function selectReport(id: string) {
    setSelected(id);
    setRows([]);
    setAdditionalOpen(false);
    setChartHidden(false);
    setError(null);
  }

  async function issueReport() {
    if (!effectiveClinicId || !selected) return;
    setPreviewOpen(true);
    await run('json');
  }

  function printPreview() {
    const title = selectedReport?.name ?? 'Relatório';
    const head = columns.map((column) => `<th>${escapePrintHtml(column.label)}</th>`).join('');
    const body = filteredRows.slice(0, 500).map((row) => (
      `<tr>${columns.map((column) => `<td>${escapePrintHtml(formatCell(column, row[column.key]))}</td>`).join('')}</tr>`
    )).join('');
    const kpis = summaries.map((kpi) => `<div><span>${escapePrintHtml(kpi.label)}</span><strong>${escapePrintHtml(kpi.value)}</strong></div>`).join('');
    printHtmlDocument(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title>
      <style>
        body{font-family:Manrope,Inter,sans-serif;color:#183139;padding:24px}
        h1{font-size:20px;margin:0 0 6px}
        p{color:#6a7d83;font-size:12px;margin:0 0 16px}
        .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
        .kpis div{border:1px solid #dce5e6;border-radius:10px;padding:10px 12px;min-width:140px}
        .kpis span{display:block;font-size:10px;color:#6a7d83}
        .kpis strong{display:block;margin-top:4px;font-size:16px}
        table{width:100%;border-collapse:collapse}
        th,td{border-bottom:1px solid #edf2f2;padding:8px 10px;text-align:left;font-size:12px}
        th{background:#f8faf9;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b8086}
      </style></head><body>
      <h1>${escapePrintHtml(title)}</h1>
      <p>${escapePrintHtml(presentation.description)}</p>
      ${kpis ? `<div class="kpis">${kpis}</div>` : ''}
      <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length, 1)}">Sem dados no período.</td></tr>`}</tbody></table>
      </body></html>`,
      title,
    );
  }

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
        description="Selecione o relatório, configure os filtros e emita a visualização final."
      />
      {error && !previewOpen ? <ErrorState description={error} onRetry={() => void run()} /> : null}
      <div className="reports-main">
        <Panel className="report-builder">
          <div className="report-builder-head">
            <strong>Emitir relatório</strong>
          </div>
          <div className="report-builder-body">
            <div className="report-step">
              <div className="report-step-number" aria-hidden>1</div>
              <div className="report-step-content">
                <div className="report-step-title">
                  <strong>Selecione o relatório</strong>
                </div>
                <div className="report-selector-grid">
                  <SearchableSelect
                    name="reportId"
                    label="Relatório"
                    hideLabel
                    value={selected}
                    onChange={selectReport}
                    options={reportOptions}
                    placeholder="Buscar relatório…"
                    searchPlaceholder="Buscar relatório…"
                    emptyMessage="Nenhum relatório encontrado."
                  />
                </div>
                {selectedReport ? (
                  <div className="report-selected">
                    <div>
                      <strong>{selectedReport.name}</strong>
                      <small>{presentation.description}</small>
                    </div>
                    <StatusBadge tone={domainTone(selectedReport.domain)}>{domainLabel(selectedReport.domain)}</StatusBadge>
                  </div>
                ) : null}
              </div>
            </div>

            {selectedReport ? (
              <div className="report-step">
                <div className="report-step-number" aria-hidden>2</div>
                <div className="report-step-content">
                  <div className="report-step-title">
                    <strong>Filtros principais</strong>
                    <small>Obrigatórios para emissão</small>
                  </div>
                  <div className="report-filters-main">
                    {(mainFilters.length ? mainFilters : MAIN_FILTERS).map((key) => renderFilter(key))}
                  </div>
                  {additionalFilters.length ? (
                    <>
                      <button
                        type="button"
                        className={`report-additional-toggle ${additionalOpen ? 'open' : ''}`}
                        aria-expanded={additionalOpen}
                        onClick={() => setAdditionalOpen((value) => !value)}
                      >
                        <span>
                          Filtros adicionais
                          <small>refine o resultado se necessário</small>
                        </span>
                        <ChevronDown size={16} />
                      </button>
                      {additionalOpen ? (
                        <div className="report-additional">
                          <div className="report-filters-main">
                            {additionalFilters.map((key) => renderFilter(key))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="report-issue-row">
                    <button
                      type="button"
                      className="button primary"
                      disabled={running || !effectiveClinicId}
                      onClick={() => void issueReport()}
                    >
                      {running && previewOpen ? 'Emitindo…' : 'Emitir relatório'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="report-placeholder">
                <strong>Nenhum relatório selecionado</strong>
                <p>Escolha um relatório acima para exibir os filtros correspondentes.</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Modal
        open={previewOpen}
        title={selectedReport?.name ?? 'Prévia do relatório'}
        description={presentation.description}
        onClose={() => {
          setPreviewOpen(false);
          setExportOpen(false);
        }}
        size="xlarge"
        actions={
          <div className="report-preview-actions">
            <button type="button" className="button" disabled={running} onClick={printPreview}>Imprimir</button>
            <button type="button" className="button" disabled={running} onClick={() => void run('pdf')}>Baixar PDF</button>
            <button type="button" className="button" disabled={running} onClick={() => void run('xlsx')}>Baixar XLS</button>
            <div className="dropdown" ref={exportRef}>
              <button type="button" className="button soft" disabled={running} onClick={() => setExportOpen((v) => !v)}>
                Mais <ChevronDown size={14} />
              </button>
              {exportOpen ? (
                <div className="row-menu-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => void run('csv')}>Baixar CSV</button>
                </div>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="report-preview">
          {selectedReport ? (
            <div className="report-preview-meta">
              <StatusBadge tone={domainTone(selectedReport.domain)}>{domainLabel(selectedReport.domain)}</StatusBadge>
              {previewChips.map((chip) => (
                <span key={chip} className="chip">{chip}</span>
              ))}
            </div>
          ) : null}
          {error ? <ErrorState description={error} onRetry={() => void run()} /> : null}
          {running ? <div className="state-message">Carregando prévia…</div> : null}
          {!running && summaries.length ? (
            <div className="report-kpis">
              {summaries.map((kpi) => (
                <div key={kpi.label} className="report-kpi">
                  <span>{kpi.label}</span>
                  <strong>{kpi.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {!running && chartData.length ? (
            <div className="chartbox">
              <div className="chart">
                <div className="chart-head">
                  <div>
                    <strong>Visão rápida</strong>
                    <p className="muted-note">Resumo visual do período selecionado</p>
                  </div>
                  <button type="button" className="button ghost small" onClick={() => setChartHidden((v) => !v)}>
                    {chartHidden ? 'Mostrar' : 'Ocultar'}
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
          {!running && filteredRows.length ? (
            <div className="table-wrap report-table-wrap">
              <div className="report-table-head">
                <strong>Pré-visualização do relatório</strong>
                <span>{filteredRows.length} {filteredRows.length === 1 ? 'linha' : 'linhas'} na prévia</span>
              </div>
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
                  {filteredRows.slice(0, 200).map((row, index) => (
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
          ) : null}
          {!running && !filteredRows.length ? (
            <EmptyState
              title="Sem dados no período"
              description="Ajuste os filtros e emita o relatório novamente."
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

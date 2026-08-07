'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { list, text, type RecordValue } from '@/lib/format';
import { useSelection } from './selection-provider';
import { EmptyState, ErrorState, MetricCard, PageHeader, Panel, Skeleton, StatusBadge } from './ui';

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
  operational: 'Operacional',
  operations: 'Operacional',
  admin: 'Administrativo',
};

function domainLabel(domain: string) {
  return DOMAIN_LABELS[domain.toLowerCase()] ?? domain;
}

function domainTone(domain: string): 'amber' | 'green' | 'blue' | 'gray' {
  const key = domain.toLowerCase();
  if (key === 'financial') return 'amber';
  if (key === 'clinical') return 'green';
  if (key === 'operational' || key === 'operations') return 'blue';
  return 'gray';
}

export function ReportsView() {
  const { clinicId } = useSelection();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<string>('production-professional');
  const [rows, setRows] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30d');

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
    const groups = new Map<string, CatalogItem[]>();
    for (const item of catalog) {
      const key = item.domain || 'other';
      const bucket = groups.get(key) ?? [];
      bucket.push(item);
      groups.set(key, bucket);
    }
    return [...groups.entries()];
  }, [catalog]);

  const selectedReport = catalog.find((item) => item.id === selected);

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

  const run = useCallback(async (format: 'json' | 'csv' | 'xlsx' | 'pdf' = 'json') => {
    if (!clinicId || !selected) return;
    setRunning(true);
    setError(null);
    try {
      const { from, to } = bounds();
      const query = new URLSearchParams({
        clinicId,
        from,
        to,
        format,
      });
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
        anchor.download = `${selected}.${extension}`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao executar relatório.');
    } finally {
      setRunning(false);
    }
  }, [bounds, clinicId, selected]);

  useEffect(() => {
    if (!clinicId || !selected || loading) return;
    const timer = window.setTimeout(() => {
      void run('json');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [clinicId, selected, period, loading, run]);

  if (loading) return <Skeleton rows={5} />;

  return (
    <div className="reports-view">
      <PageHeader
        eyebrow="Administração"
        title="Relatórios"
        description="Catálogo clínico, financeiro e operacional com exportação CSV/XLSX/PDF."
      />
      <div className="metric-grid">
        <MetricCard label="Relatórios" value={catalog.length} />
        <MetricCard label="Selecionado" value={selectedReport?.name ?? '—'} />
        <MetricCard label="Linhas" value={rows.length} />
        <MetricCard label="Período" value={PERIODS.find((item) => item.id === period)?.label ?? period} />
      </div>
      {error ? <ErrorState description={error} onRetry={() => void run()} /> : null}
      <div className="reports-layout">
        <Panel title="Catálogo" description="Escolha o relatório e o período">
          <div className="chip-row" role="group" aria-label="Período">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip ${period === item.id ? 'active' : ''}`}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="report-catalog">
            {catalogByDomain.map(([domain, items]) => (
              <div key={domain} className="report-domain-group">
                <small className="report-domain-label">{domainLabel(domain)}</small>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`report-card ${selected === item.id ? 'active' : ''}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <StatusBadge tone={domainTone(item.domain)}>
                      {domainLabel(item.domain)}
                    </StatusBadge>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title={selectedReport?.name ?? 'Pré-visualização'}
          description={running ? 'Atualizando…' : `${rows.length} linha(s) no período`}
          actions={(
            <div className="heading-actions" style={{ marginLeft: 0 }}>
              <button type="button" className="button soft small" disabled={running} onClick={() => void run('csv')}>
                Exportar CSV
              </button>
              <button type="button" className="button soft small" disabled={running} onClick={() => void run('xlsx')}>
                Exportar XLSX
              </button>
              <button type="button" className="button soft small" disabled={running} onClick={() => void run('pdf')}>
                Exportar PDF
              </button>
              <button type="button" className="button primary small" disabled={running} onClick={() => void run('json')}>
                Atualizar
              </button>
            </div>
          )}
        >
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(rows[0] ?? {}).map((key) => <th key={key}>{key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, index) => (
                    <tr key={index}>
                      {Object.keys(rows[0] ?? {}).map((key) => <td key={key}>{text(row[key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={running ? 'Carregando prévia…' : 'Sem dados no período'}
              description="Ajuste o período ou escolha outro relatório do catálogo."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

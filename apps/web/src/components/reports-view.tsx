'use client';

import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    setLoading(true);
    api.get<CatalogItem[]>('/reports/catalog')
      .then((data) => setCatalog(Array.isArray(data) ? data : list(data) as CatalogItem[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Falha ao carregar catálogo.'))
      .finally(() => setLoading(false));
  }, []);

  async function run(format: 'json' | 'csv' | 'pdf' = 'json') {
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
        anchor.download = `${selected}.${format === 'pdf' ? 'txt' : 'csv'}`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao executar relatório.');
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <Skeleton rows={5} />;

  return (
    <div className="reports-view">
      <PageHeader
        eyebrow="Administração"
        title="Relatórios"
        description="Catálogo clínico, financeiro e operacional com exportação CSV/XLSX/PDF."
        actions={(
          <>
            <button type="button" className="button soft" disabled={running} onClick={() => void run('csv')}>Exportar CSV/XLSX</button>
            <button type="button" className="button soft" disabled={running} onClick={() => void run('pdf')}>Exportar PDF</button>
            <button type="button" className="button primary" disabled={running} onClick={() => void run('json')}>Atualizar</button>
          </>
        )}
      />
      <div className="metric-grid">
        <MetricCard label="Relatórios" value={catalog.length} />
        <MetricCard label="Selecionado" value={catalog.find((item) => item.id === selected)?.name ?? '—'} />
        <MetricCard label="Linhas" value={rows.length} />
        <MetricCard label="Período" value={period} />
      </div>
      {error ? <ErrorState description={error} onRetry={() => void run()} /> : null}
      <div className="reports-layout">
        <Panel title="Central de relatórios">
          <div className="chip-row">
            {['today', '7d', '30d', '90d', 'year'].map((item) => (
              <button key={item} type="button" className={`chip ${period === item ? 'active' : ''}`} onClick={() => setPeriod(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="report-catalog">
            {catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`report-card ${selected === item.id ? 'active' : ''}`}
                onClick={() => setSelected(item.id)}
              >
                <strong>{item.name}</strong>
                <StatusBadge tone={item.domain === 'financial' ? 'amber' : item.domain === 'clinical' ? 'green' : 'blue'}>
                  {item.domain}
                </StatusBadge>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={`Exemplo: ${catalog.find((item) => item.id === selected)?.name ?? selected}`}>
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
            <EmptyState title="Sem dados no período" description="Ajuste o período ou execute outro relatório do catálogo." />
          )}
        </Panel>
      </div>
    </div>
  );
}

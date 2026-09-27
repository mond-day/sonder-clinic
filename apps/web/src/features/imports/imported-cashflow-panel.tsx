'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, MetricCard, Panel, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { currency } from '@/lib/format';
import { isoDayLabel } from './import-types';

type Period = '12m' | 'year' | 'all';

type CashEntry = {
  id: string;
  kind: 'INFLOW' | 'OUTFLOW';
  counterpartyName: string;
  description: string | null;
  category: string | null;
  dueDate: string | null;
  paidAt: string | null;
  amount: number;
  paid: boolean;
  paymentMethod: string | null;
};

type CashResponse = {
  totals: { inflowPaid: number; inflowOpen: number; outflowPaid: number; outflowOpen: number; count: number };
  items: CashEntry[];
};

function periodRange(period: Period): { from?: string; to?: string } {
  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  if (period === 'all') return {};
  if (period === 'year') return { from: `${today.getFullYear()}-01-01`, to: iso(today) };
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  return { from: iso(from), to: iso(today) };
}

/**
 * Histórico de caixa vindo de planilha. Fica separado do fluxo real: não entra nos totais,
 * não gera recebíveis/contas e não sincroniza com o Nibo.
 */
export function ImportedCashflowPanel({ clinicId, refreshKey }: { clinicId: string; refreshKey: number }) {
  const [period, setPeriod] = useState<Period>('12m');
  const [data, setData] = useState<CashResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ clinicId, ...periodRange(period) });
    api.get<CashResponse>(`/imports/cashflow-entries?${query}`)
      .then(setData)
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o histórico importado.'))
      .finally(() => setLoading(false));
  }, [clinicId, period]);

  useEffect(load, [load, refreshKey]);

  return (
    <Panel
      title="Histórico importado (somente consulta)"
      description="Lançamentos vindos de planilha. Não entram nos totais acima, não geram recebíveis nem contas a pagar e não sincronizam com o Nibo."
    >
      <div className="chip-row" role="group" aria-label="Período do histórico importado">
        {([['12m', '12 meses'], ['year', 'Ano atual'], ['all', 'Tudo']] as const).map(([id, label]) => (
          <button key={id} type="button" className={`chip ${period === id ? 'active' : ''}`} onClick={() => setPeriod(id)}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <div className="state-message">Carregando…</div> : null}
      {error ? <div className="state-message error" role="alert">{error}</div> : null}
      {data && !loading ? (
        <>
          <section className="stats">
            <MetricCard label="Receitas recebidas" value={currency(data.totals.inflowPaid)} meta={`${currency(data.totals.inflowOpen)} em aberto`} tone="green" />
            <MetricCard label="Despesas pagas" value={currency(data.totals.outflowPaid)} meta={`${currency(data.totals.outflowOpen)} em aberto`} tone="red" />
            <MetricCard label="Lançamentos" value={data.totals.count} meta={data.items.length < data.totals.count ? `exibindo ${data.items.length} mais recentes` : 'no período'} />
          </section>
          {data.items.length === 0 ? (
            <EmptyState title="Nenhum lançamento importado no período." description="Use “Importar histórico” para trazer a planilha de fluxo de caixa." />
          ) : (
            <div className="table-wrap cashflow-series-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Data</th><th>Tipo</th><th>Nome</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th>Valor</th><th>Situação</th></tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{isoDayLabel(item.paidAt ?? item.dueDate)}</td>
                      <td>{item.kind === 'INFLOW' ? 'Receita' : 'Despesa'}</td>
                      <td>{item.counterpartyName}</td>
                      <td>{item.description ?? '—'}</td>
                      <td>{item.category ?? '—'}</td>
                      <td>{item.paymentMethod ?? '—'}</td>
                      <td style={{ color: item.kind === 'OUTFLOW' ? 'var(--danger)' : undefined }}>{currency(item.amount)}</td>
                      <td><StatusBadge tone={item.paid ? 'green' : 'amber'}>{item.paid ? 'Pago' : 'Em aberto'}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Panel>
  );
}

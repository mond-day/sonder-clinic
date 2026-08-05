'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  currency,
  dateOnly,
  hasPermission,
  list,
  nested,
  presentationLabel,
  statusTone,
  text,
  type RecordValue,
} from '@/lib/format';
import { useAuth } from './auth-provider';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, UnavailableFeature } from './ui';
import { Modal } from './modal';

type FinanceTab = 'overview' | 'receivable' | 'payable' | 'commissions' | 'recurring' | 'cashflow';

const tabs: Array<{ id: FinanceTab; label: string; available: boolean }> = [
  { id: 'overview', label: 'Visão geral', available: true },
  { id: 'receivable', label: 'Contas a receber', available: true },
  { id: 'payable', label: 'Contas a pagar', available: false },
  { id: 'commissions', label: 'Comissões', available: true },
  { id: 'recurring', label: 'Recorrências', available: false },
  { id: 'cashflow', label: 'Fluxo de caixa', available: false },
];

export function FinanceView() {
  const { user } = useAuth();
  const { clinicId, clinics, professionals } = useSelection();
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [rules, setRules] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedReceivable, setSelectedReceivable] = useState<RecordValue | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const canFinance = hasPermission(user?.permissions, 'financial.view');
  const canCommission = hasPermission(user?.permissions, 'commission.view_all', 'organization.manage');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      canFinance ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>('/commission-rules').catch(() => []) : Promise.resolve([]),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => []),
    ])
      .then(([nextReceivables, nextRules, nextPatients]) => {
        setReceivables(list(nextReceivables));
        setRules(list(nextRules));
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o financeiro.'))
      .finally(() => setLoading(false));
  }, [canCommission, canFinance, clinicId]);

  useEffect(load, [load]);
  useEffect(() => {
    setFiltersOpen(window.localStorage.getItem('sonder.finance.filtersOpen') === 'true');
  }, []);

  const open = useMemo(
    () => receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))),
    [receivables],
  );
  const overdue = useMemo(
    () => receivables.filter((item) => item.status === 'OVERDUE'),
    [receivables],
  );
  const paid = useMemo(
    () => receivables.filter((item) => item.status === 'PAID'),
    [receivables],
  );
  const openTotal = open.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0);
  const overdueTotal = overdue.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0);
  const paidTotal = paid.reduce((sum, item) => sum + Number(item.netAmount ?? 0), 0);

  if (!canFinance && tab !== 'commissions') {
    return (
      <>
        <PageHeader title="Gestão financeira" description="Acesso restrito pela permissão financial.view." />
        <div className="state-message error" role="alert">Você não possui permissão para visualizar o financeiro.</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Gestão financeira"
        description="Entradas, comissões e módulos previstos — dados reais onde a API existe."
        actions={
          <>
            <button className="button secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={16} />Atualizar
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <div className="finance-subnav" role="tablist" aria-label="Áreas financeiras">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`finance-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}{!item.available ? ' · API' : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <section className="stats">
            <MetricCard label="Recebido (pagos)" value={currency(paidTotal)} meta={`${paid.length} títulos`} />
            <MetricCard label="A receber" value={currency(openTotal)} meta={`${open.length} lançamentos`} />
            <MetricCard label="Em atraso" value={currency(overdueTotal)} meta={`${overdue.length} títulos`} tone={overdue.length ? 'red' : 'green'} />
            <MetricCard label="Regras de comissão" value={rules.length} meta={canCommission ? 'Carregadas' : 'Sem permissão'} />
          </section>
          <div className="dashboard-grid">
            <Panel title="Atenção financeira" description="Pendências acionáveis dos receivables">
              <div className="billing-list">
                <div className="billing-row">
                  <div><strong>{overdue.length} títulos vencidos</strong><span>{currency(overdueTotal)}</span></div>
                  <StatusBadge tone="red">Cobrar</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>{open.length} em aberto</strong><span>{currency(openTotal)}</span></div>
                  <StatusBadge tone="amber">Acompanhar</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>Contas a pagar / fluxo</strong><span>Aguardando endpoints</span></div>
                  <StatusBadge tone="gray">Pendente</StatusBadge>
                </div>
              </div>
            </Panel>
            <Panel title="Atalhos" description="Módulos disponíveis">
              <div className="billing-list">
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('receivable')}>
                  <div><strong>Contas a receber</strong><span>Criar título e registrar pagamento</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('commissions')}>
                  <div><strong>Comissões</strong><span>Regras versionadas</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
              </div>
            </Panel>
          </div>
        </>
      )}

      {tab === 'receivable' && (
        <>
          <Modal open={Boolean(selectedReceivable)} title="Detalhes da conta a receber" description="Título, tratamento/orçamento e pagamentos vinculados." onClose={() => setSelectedReceivable(null)}>
            {selectedReceivable ? (
              <div>
                <div className="info-grid">
                  <div className="info-item"><small>Descrição</small><strong>{text(selectedReceivable.description)}</strong></div>
                  <div className="info-item"><small>Status</small><strong>{presentationLabel(selectedReceivable.status)}</strong></div>
                  <div className="info-item"><small>Valor líquido</small><strong>{currency(selectedReceivable.netAmount)}</strong></div>
                  <div className="info-item"><small>Vencimento</small><strong>{dateOnly(selectedReceivable.dueDate)}</strong></div>
                  <div className="info-item"><small>Tratamento/orçamento</small><strong>{text(nested(selectedReceivable, 'treatment').title, 'Não vinculado')}</strong></div>
                  <div className="info-item"><small>Situação clínica</small><strong>{presentationLabel(nested(selectedReceivable, 'treatment').status)}</strong></div>
                </div>
                {selectedReceivable.patientId ? <div className="modal-footer"><Link className="button primary" href={`/pacientes/${String(selectedReceivable.patientId)}?tab=financeiro`}>Abrir paciente</Link></div> : null}
              </div>
            ) : null}
          </Modal>
          <ModuleActions
            module="financeiro"
            clinicId={clinicId}
            clinics={clinics}
            professionals={professionals}
            patients={patients}
            selectedPatientId=""
            onPatientChange={() => undefined}
            onSaved={load}
          />
          <Panel title="Contas a receber" description="Fonte: GET /receivables" actions={<button className="button small" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => { window.localStorage.setItem('sonder.finance.filtersOpen', String(!value)); return !value; })}><SlidersHorizontal size={14} />Filtros</button>}>
            <div className="summary-strip">
              <div><small>Em aberto</small><strong>{currency(openTotal)}</strong></div>
              <div><small>Em atraso</small><strong style={{ color: 'var(--danger)' }}>{currency(overdueTotal)}</strong></div>
              <div><small>Pagos</small><strong>{currency(paidTotal)}</strong></div>
              <div><small>Total de títulos</small><strong>{receivables.length}</strong></div>
            </div>
            {filtersOpen ? <div className="filters"><select className="filter-select" aria-label="Filtrar contas por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="OPEN">Em aberto</option><option value="PARTIALLY_PAID">Parcialmente pago</option><option value="PAID">Pago</option><option value="OVERDUE">Vencido</option></select></div> : null}
            {loading ? <div className="state-message">Carregando…</div> : null}
            {!loading && receivables.length === 0 ? <EmptyState title="Nenhum título" description="Crie o primeiro título acima." /> : null}
            {receivables.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.filter((item) => !statusFilter || item.status === statusFilter).map((item) => (
                      <tr key={String(item.id)} onClick={() => setSelectedReceivable(item)} style={{ cursor: 'pointer' }}>
                        <td>{text(item.description)}</td>
                        <td>{dateOnly(item.dueDate)}</td>
                        <td>{currency(item.netAmount)}</td>
                        <td><StatusBadge tone={statusTone(item.status)}>{presentationLabel(item.status)}</StatusBadge></td>
                        <td className="row-actions">
                          {item.patientId ? (
                            <Link className="button small" onClick={(event) => event.stopPropagation()} href={`/pacientes/${String(item.patientId)}?tab=financeiro`}>Paciente</Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {tab === 'commissions' && (
        <Panel title="Regras de comissão" description="GET /commission-rules — fechamento detalhado aguarda API de eventos">
          {!canCommission ? (
            <div className="state-message error" role="alert">Sem permissão commission.view_all.</div>
          ) : rules.length === 0 ? (
            <EmptyState title="Nenhuma regra" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Base</th><th>Cálculo</th><th>Valor</th><th>Vigência</th></tr>
                </thead>
                <tbody>
                  {rules.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{presentationLabel(item.basis)}</td>
                      <td>{presentationLabel(item.calculationType)}</td>
                      <td>{text(item.value)}</td>
                      <td>{dateOnly(item.validFrom)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === 'payable' && (
        <UnavailableFeature
          title="Contas a pagar"
          description="A API atual não expõe payables. A interface permanece pronta para consumir o contrato quando existir."
          contractHint="GET/POST /api/v1/payables"
        />
      )}
      {tab === 'recurring' && (
        <UnavailableFeature
          title="Recorrências financeiras"
          description="Sem endpoint de recorrências. Evitamos mocks de produção."
          contractHint="GET/POST /api/v1/finance-recurrences"
        />
      )}
      {tab === 'cashflow' && (
        <UnavailableFeature
          title="Fluxo de caixa"
          description="O relatório resumido existe em /reports/summary, mas não há série temporal de caixa."
          contractHint="GET /api/v1/cashflow?clinicId&from&to"
        />
      )}
    </>
  );
}

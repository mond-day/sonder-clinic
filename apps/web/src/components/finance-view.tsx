'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  { id: 'payable', label: 'Contas a pagar', available: true },
  { id: 'commissions', label: 'Comissões', available: true },
  { id: 'recurring', label: 'Recorrências', available: false },
  { id: 'cashflow', label: 'Fluxo de caixa', available: true },
];

const financeTabIds = new Set<string>(tabs.map((item) => item.id));

export function FinanceView({ initialTab }: { initialTab?: FinanceTab } = {}) {
  const searchParams = useSearchParams();
  const tabFromQuery = searchParams.get('tab') ?? '';
  const resolvedInitial: FinanceTab = initialTab
    ?? (financeTabIds.has(tabFromQuery) ? tabFromQuery as FinanceTab : 'overview');
  const { user } = useAuth();
  const { clinicId, clinics, professionals } = useSelection();
  const [tab, setTab] = useState<FinanceTab>(resolvedInitial);
  const [receivables, setReceivables] = useState<RecordValue[]>([]);
  const [payables, setPayables] = useState<RecordValue[]>([]);
  const [cashflow, setCashflow] = useState<RecordValue | null>(null);
  const [rules, setRules] = useState<RecordValue[]>([]);
  const [commissionEvents, setCommissionEvents] = useState<RecordValue[]>([]);
  const [commissionPeriods, setCommissionPeriods] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedReceivable, setSelectedReceivable] = useState<RecordValue | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [closingId, setClosingId] = useState<string | null>(null);
  const canFinance = hasPermission(user?.permissions, 'financial.view');
  const canCommission = hasPermission(user?.permissions, 'commission.view_all', 'organization.manage');
  const canCloseCommission = hasPermission(user?.permissions, 'commission.close', 'organization.manage');

  useEffect(() => {
    setTab(resolvedInitial);
  }, [resolvedInitial]);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const month = new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    Promise.all([
      canFinance ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`) : Promise.resolve([]),
      canFinance ? api.get<RecordValue[]>(`/payables?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      canFinance ? api.get<RecordValue>(`/cashflow?clinicId=${clinicId}`).catch(() => null) : Promise.resolve(null),
      canCommission ? api.get<RecordValue[]>('/commission-rules').catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-events?clinicId=${clinicId}&from=${from}`).catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-periods?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => []),
    ])
      .then(([nextReceivables, nextPayables, nextCashflow, nextRules, nextEvents, nextPeriods, nextPatients]) => {
        setReceivables(list(nextReceivables));
        setPayables(list(nextPayables));
        setCashflow(nextCashflow);
        setRules(list(nextRules));
        setCommissionEvents(list(nextEvents));
        setCommissionPeriods(list(nextPeriods));
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o financeiro.'))
      .finally(() => setLoading(false));
  }, [canCommission, canFinance, clinicId]);

  useEffect(load, [load]);

  const closePeriod = async (periodId: string) => {
    setClosingId(periodId);
    try {
      await api.post(`/commission-periods/${periodId}/close`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível fechar a competência.');
    } finally {
      setClosingId(null);
    }
  };

  const ensureOpenPeriod = async () => {
    if (!clinicId) return;
    try {
      const referenceMonth = `${new Date().toISOString().slice(0, 7)}-01`;
      await api.post('/commission-periods', { clinicId, referenceMonth });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível abrir a competência.');
    }
  };
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

  const filteredReceivables = useMemo(() => {
    const query = patientQuery.trim().toLocaleLowerCase('pt-BR');
    return receivables.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!query) return true;
      const patientName = text(nested(item, 'patient').fullName, '').toLocaleLowerCase('pt-BR');
      const description = text(item.description).toLocaleLowerCase('pt-BR');
      return patientName.includes(query) || description.includes(query);
    });
  }, [patientQuery, receivables, statusFilter]);

  const activeRules = useMemo(
    () => rules.filter((item) => {
      const validTo = item.validTo ? new Date(String(item.validTo)) : null;
      return !validTo || validTo.getTime() >= Date.now();
    }),
    [rules],
  );
  const averagePercent = useMemo(() => {
    const percentRules = rules.filter((item) => {
      const type = String(item.calculationType ?? '').toUpperCase();
      return type.includes('PERCENT') || type === 'PERCENTAGE';
    });
    if (!percentRules.length) return null;
    const sum = percentRules.reduce((total, item) => total + Number(item.value ?? 0), 0);
    return sum / percentRules.length;
  }, [rules]);

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
        description="Acompanhe títulos a receber, pagamentos e regras de comissão com dados reais da clínica."
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
          <Panel
            title="Contas a receber"
            description="Títulos em aberto, pagos e vencidos"
            actions={
              <button
                className="button small"
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((value) => {
                  window.localStorage.setItem('sonder.finance.filtersOpen', String(!value));
                  return !value;
                })}
              >
                <SlidersHorizontal size={14} />Filtros avançados
              </button>
            }
          >
            <div className="summary-strip">
              <div><small>Em aberto</small><strong>{currency(openTotal)}</strong></div>
              <div><small>Em atraso</small><strong style={{ color: 'var(--danger)' }}>{currency(overdueTotal)}</strong></div>
              <div><small>Pagos</small><strong>{currency(paidTotal)}</strong></div>
              <div><small>Total de títulos</small><strong>{receivables.length}</strong></div>
            </div>
            <div className="filters">
              <select
                className="filter-select"
                aria-label="Filtrar contas por status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">Todos os status</option>
                <option value="OPEN">Em aberto</option>
                <option value="PARTIALLY_PAID">Parcialmente pago</option>
                <option value="PAID">Pago</option>
                <option value="OVERDUE">Vencido</option>
              </select>
            </div>
            {filtersOpen ? (
              <div className="filters">
                <input
                  className="filter-input"
                  placeholder="Buscar paciente ou descrição…"
                  value={patientQuery}
                  onChange={(event) => setPatientQuery(event.target.value)}
                  aria-label="Buscar por paciente ou descrição"
                />
              </div>
            ) : null}
            {loading ? <div className="state-message">Carregando…</div> : null}
            {!loading && filteredReceivables.length === 0 ? <EmptyState title="Nenhum título" description={receivables.length ? 'Nenhum resultado para os filtros.' : 'Crie o primeiro título acima.'} /> : null}
            {filteredReceivables.length > 0 && (
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
                    {filteredReceivables.map((item) => (
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
        <>
          <Panel
            title="Comissões e repasses"
            description="Pagamentos confirmados geram eventos por competência. Feche o mês para liberar os valores."
          >
            {!canCommission ? (
              <div className="state-message error" role="alert">Sem permissão commission.view_all.</div>
            ) : (
              <>
                <section className="stats">
                  <MetricCard label="Regras ativas" value={activeRules.length} meta={`${rules.length} no total`} />
                  <MetricCard
                    label="% média"
                    value={averagePercent == null ? '—' : `${averagePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                    meta="Regras percentuais"
                  />
                  <MetricCard label="Bases cadastradas" value={new Set(rules.map((item) => String(item.basis ?? ''))).size} meta="Tipos de base" />
                  <MetricCard label="Eventos no período" value={commissionEvents.length} meta="Competência atual" />
                </section>

                <div className="form-section">
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>Competências</h3>
                    {canCloseCommission ? (
                      <button className="button small" type="button" onClick={() => void ensureOpenPeriod()}>
                        Garantir mês aberto
                      </button>
                    ) : null}
                  </header>
                  {commissionPeriods.length === 0 ? (
                    <EmptyState title="Nenhuma competência" description="Eventos de pagamento abrem a competência automaticamente." />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Mês</th>
                            <th>Status</th>
                            <th>Eventos</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {commissionPeriods.map((period) => (
                            <tr key={String(period.id)}>
                              <td>{dateOnly(period.referenceMonth)}</td>
                              <td><StatusBadge tone={period.status === 'CLOSED' ? 'green' : 'amber'}>{presentationLabel(period.status)}</StatusBadge></td>
                              <td>{text(nested(period, '_count').events, '0')}</td>
                              <td>
                                {canCloseCommission && period.status === 'OPEN' ? (
                                  <button
                                    className="button small primary"
                                    type="button"
                                    disabled={closingId === String(period.id)}
                                    onClick={() => void closePeriod(String(period.id))}
                                  >
                                    {closingId === String(period.id) ? 'Fechando…' : 'Fechar'}
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <header>
                    <h3>Regras cadastradas</h3>
                  </header>
                  {rules.length === 0 ? (
                    <EmptyState title="Nenhuma regra" description="Cadastre regras de comissão para começar a calcular repasses." />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Base</th>
                            <th>Cálculo</th>
                            <th>Valor</th>
                            <th>Vigência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rules.map((item) => (
                            <tr key={String(item.id)}>
                              <td>{presentationLabel(item.basis)}</td>
                              <td>{presentationLabel(item.calculationType)}</td>
                              <td>{text(item.value)}</td>
                              <td>
                                {dateOnly(item.validFrom)}
                                {item.validTo ? ` → ${dateOnly(item.validTo)}` : ' · vigente'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="form-section">
                  <header>
                    <h3>Valores gerados no período</h3>
                  </header>
                  {commissionEvents.length === 0 ? (
                    <EmptyState
                      title="Nenhum evento de comissão"
                      description="Eventos nascem ao confirmar pagamento de recebível vinculado a tratamento com profissional e regra ativa."
                    />
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Base</th>
                            <th>Comissão</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commissionEvents.map((item) => (
                            <tr key={String(item.id)}>
                              <td>{dateOnly(item.occurredAt)}</td>
                              <td>{currency(item.basisAmount)}</td>
                              <td>{currency(item.commissionAmount)}</td>
                              <td><StatusBadge tone={statusTone(String(item.status))}>{presentationLabel(item.status)}</StatusBadge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </Panel>
        </>
      )}

      {tab === 'payable' && (
        <Panel title="Contas a pagar" description="Títulos de saída da clínica.">
          {!canFinance ? (
            <div className="state-message error" role="alert">Sem permissão financial.view.</div>
          ) : payables.length === 0 ? (
            <EmptyState title="Nenhuma conta a pagar" description="Cadastre despesas pelo módulo financeiro quando necessário." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{text(item.description)}</td>
                      <td>{dateOnly(item.dueDate)}</td>
                      <td>{currency(item.originalAmount ?? item.netAmount)}</td>
                      <td><StatusBadge tone={statusTone(String(item.status))}>{presentationLabel(item.status)}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {tab === 'recurring' && (
        <UnavailableFeature
          title="Recorrências financeiras"
          description="Sem endpoint de recorrências. Evitamos mocks de produção."
          contractHint="GET/POST /api/v1/finance-recurrences"
        />
      )}
      {tab === 'cashflow' && (
        <Panel title="Fluxo de caixa" description="Entradas e saídas consolidadas da clínica.">
          {!canFinance ? (
            <div className="state-message error" role="alert">Sem permissão financial.view.</div>
          ) : !cashflow ? (
            <EmptyState title="Sem dados de fluxo" description="O endpoint /cashflow não retornou agregados para o período." />
          ) : (
            <section className="stats">
              <MetricCard label="Entradas" value={currency(cashflow.inflow ?? 0)} />
              <MetricCard label="Saídas" value={currency(cashflow.outflow ?? 0)} />
              <MetricCard label="Saldo" value={currency(cashflow.net ?? 0)} />
            </section>
          )}
        </Panel>
      )}
    </>
  );
}

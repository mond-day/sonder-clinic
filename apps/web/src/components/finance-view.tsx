'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';

type FinanceTab = 'overview' | 'receivable' | 'payable' | 'commissions' | 'recurring' | 'cashflow';

const tabs: Array<{ id: FinanceTab; label: string; available: boolean }> = [
  { id: 'overview', label: 'Visão geral', available: true },
  { id: 'receivable', label: 'Contas a receber', available: true },
  { id: 'payable', label: 'Contas a pagar', available: true },
  { id: 'commissions', label: 'Comissões', available: true },
  { id: 'recurring', label: 'Recorrências', available: true },
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
  const [recurrences, setRecurrences] = useState<RecordValue[]>([]);
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
  const [recurrenceBusy, setRecurrenceBusy] = useState<string | null>(null);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [recurrenceFiltersOpen, setRecurrenceFiltersOpen] = useState(false);
  const [recurrenceQuery, setRecurrenceQuery] = useState('');
  const [recurrenceKindFilter, setRecurrenceKindFilter] = useState('');
  const [cashflowPeriod, setCashflowPeriod] = useState<'7d' | '30d' | '90d' | 'year'>('30d');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    basis: 'PRODUCTION',
    calculationType: 'PERCENTAGE',
    value: '30',
    validFrom: new Date().toISOString().slice(0, 10),
    professionalId: '',
    priority: '0',
  });
  const [recurrenceForm, setRecurrenceForm] = useState({
    kind: 'PAYABLE',
    description: '',
    amount: '',
    frequency: 'MONTHLY',
    interval: '1',
    nextOccurrence: new Date().toISOString().slice(0, 10),
    endsAt: '',
    patientId: '',
    supplierName: '',
  });
  const canFinance = hasPermission(user?.permissions, 'financial.view');
  const canFinanceCreate = hasPermission(user?.permissions, 'financial.create', 'organization.manage');
  const canCommission = hasPermission(user?.permissions, 'commission.view_all', 'organization.manage');
  const canCloseCommission = hasPermission(user?.permissions, 'commission.close', 'organization.manage');
  const canConfigureCommission = hasPermission(user?.permissions, 'commission.configure', 'organization.manage');

  useEffect(() => {
    setTab(resolvedInitial);
  }, [resolvedInitial]);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    const month = new Date().toISOString().slice(0, 7);
    const from = `${month}-01`;
    const cashTo = new Date();
    const cashFrom = new Date();
    if (cashflowPeriod === '7d') cashFrom.setDate(cashFrom.getDate() - 7);
    else if (cashflowPeriod === '90d') cashFrom.setDate(cashFrom.getDate() - 90);
    else if (cashflowPeriod === 'year') cashFrom.setMonth(0, 1);
    else cashFrom.setDate(cashFrom.getDate() - 30);
    const cashQuery = new URLSearchParams({
      clinicId,
      from: cashFrom.toISOString(),
      to: cashTo.toISOString(),
    });
    Promise.all([
      canFinance ? api.get<RecordValue[]>(`/receivables?clinicId=${clinicId}`) : Promise.resolve([]),
      canFinance ? api.get<RecordValue[]>(`/payables?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      canFinance ? api.get<RecordValue[]>(`/finance-recurrences?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      canFinance ? api.get<RecordValue>(`/cashflow?${cashQuery}`).catch(() => null) : Promise.resolve(null),
      canCommission ? api.get<RecordValue[]>('/commission-rules').catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-events?clinicId=${clinicId}&from=${from}`).catch(() => []) : Promise.resolve([]),
      canCommission ? api.get<RecordValue[]>(`/commission-periods?clinicId=${clinicId}`).catch(() => []) : Promise.resolve([]),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => []),
    ])
      .then(([nextReceivables, nextPayables, nextRecurrences, nextCashflow, nextRules, nextEvents, nextPeriods, nextPatients]) => {
        setReceivables(list(nextReceivables));
        setPayables(list(nextPayables));
        setRecurrences(list(nextRecurrences));
        setCashflow(nextCashflow);
        setRules(list(nextRules));
        setCommissionEvents(list(nextEvents));
        setCommissionPeriods(list(nextPeriods));
        setPatients(list(nextPatients));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar o financeiro.'))
      .finally(() => setLoading(false));
  }, [canCommission, canFinance, cashflowPeriod, clinicId]);

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

  const createRecurrence = async (event: FormEvent) => {
    event.preventDefault();
    if (!clinicId || !canFinanceCreate) return;
    setRecurrenceBusy('create');
    setError('');
    try {
      await api.post('/finance-recurrences', {
        clinicId,
        kind: recurrenceForm.kind,
        description: recurrenceForm.description,
        amount: recurrenceForm.amount.replace(',', '.'),
        frequency: recurrenceForm.frequency,
        interval: Number(recurrenceForm.interval) || 1,
        nextOccurrence: recurrenceForm.nextOccurrence,
        endsAt: recurrenceForm.endsAt || undefined,
        patientId: recurrenceForm.kind === 'RECEIVABLE' ? recurrenceForm.patientId || undefined : undefined,
        supplierName: recurrenceForm.kind === 'PAYABLE' ? recurrenceForm.supplierName || undefined : undefined,
      });
      setRecurrenceForm((prev) => ({
        ...prev,
        description: '',
        amount: '',
        supplierName: '',
        patientId: '',
      }));
      setRecurrenceOpen(false);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a recorrência.');
    } finally {
      setRecurrenceBusy(null);
    }
  };

  const createCommissionRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!canConfigureCommission) return;
    setRuleBusy(true);
    setError('');
    try {
      await api.post('/commission-rules', {
        clinicId,
        basis: ruleForm.basis,
        calculationType: ruleForm.calculationType,
        value: ruleForm.value.replace(',', '.'),
        validFrom: ruleForm.validFrom,
        professionalId: ruleForm.professionalId || undefined,
        priority: Number(ruleForm.priority) || 0,
      });
      setRuleOpen(false);
      setRuleForm((prev) => ({ ...prev, value: '30', professionalId: '' }));
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a regra.');
    } finally {
      setRuleBusy(false);
    }
  };

  const deactivateRule = async (id: string) => {
    if (!canConfigureCommission) return;
    setRuleBusy(true);
    try {
      await api.post(`/commission-rules/${id}/deactivate`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível desativar a regra.');
    } finally {
      setRuleBusy(false);
    }
  };

  const toggleRecurrence = async (id: string, active: boolean) => {
    setRecurrenceBusy(id);
    try {
      await api.patch(`/finance-recurrences/${id}`, { active: !active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar a recorrência.');
    } finally {
      setRecurrenceBusy(null);
    }
  };

  const generateRecurrence = async (id: string) => {
    setRecurrenceBusy(id);
    try {
      await api.post(`/finance-recurrences/${id}/generate`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível gerar a ocorrência.');
    } finally {
      setRecurrenceBusy(null);
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
    () => receivables.filter((item) => {
      const status = String(item.effectiveStatus ?? item.status);
      return status === 'OVERDUE' || (
        !['PAID', 'CANCELLED'].includes(String(item.status))
        && Number(item.outstandingAmount ?? item.netAmount ?? 0) > 0
        && item.dueDate
        && new Date(String(item.dueDate)).getTime() < Date.now() - 86_400_000
      );
    }),
    [receivables],
  );
  const paid = useMemo(
    () => receivables.filter((item) => item.status === 'PAID'),
    [receivables],
  );
  const openTotal = open.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0);
  const overdueTotal = overdue.reduce((sum, item) => sum + Number(item.outstandingAmount ?? item.netAmount ?? 0), 0);
  const paidTotal = paid.reduce((sum, item) => sum + Number(item.paidAmount ?? item.netAmount ?? 0), 0);

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

  const filteredRecurrences = useMemo(() => {
    const query = recurrenceQuery.trim().toLocaleLowerCase('pt-BR');
    return recurrences.filter((item) => {
      if (recurrenceKindFilter && item.kind !== recurrenceKindFilter) return false;
      if (!query) return true;
      return text(item.description).toLocaleLowerCase('pt-BR').includes(query);
    });
  }, [recurrenceKindFilter, recurrenceQuery, recurrences]);

  const paymentMethodLabel = (value: unknown) => {
    const key = String(value ?? '');
    const labels: Record<string, string> = {
      PIX: 'PIX',
      CREDIT_CARD: 'Cartão de crédito',
      DEBIT_CARD: 'Cartão de débito',
      CASH: 'Dinheiro',
      TRANSFER: 'Transferência',
      OTHER: 'Outro',
    };
    return labels[key] ?? presentationLabel(value);
  };

  const activeRules = useMemo(
    () => rules.filter((item) => {
      if (item.active === false) return false;
      const validTo = item.validUntil ?? item.validTo;
      const until = validTo ? new Date(String(validTo)) : null;
      return !until || until.getTime() >= Date.now();
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
                  <div><strong>Contas a pagar</strong><span>{payables.length} títulos</span></div>
                  <StatusBadge tone="blue">Ativo</StatusBadge>
                </div>
                <div className="billing-row">
                  <div><strong>Recorrências</strong><span>{recurrences.filter((item) => item.active).length} ativas</span></div>
                  <StatusBadge tone="blue">Ativo</StatusBadge>
                </div>
              </div>
            </Panel>
            <Panel title="Atalhos" description="Módulos disponíveis">
              <div className="billing-list">
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('receivable')}>
                  <div><strong>Contas a receber</strong><span>Criar título e registrar pagamento</span></div>
                  <StatusBadge tone="blue">Abrir</StatusBadge>
                </button>
                <button className="billing-row" type="button" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setTab('recurring')}>
                  <div><strong>Recorrências</strong><span>Gerar títulos periódicos</span></div>
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
                  <div className="info-item"><small>Status</small><strong>{presentationLabel(selectedReceivable.effectiveStatus ?? selectedReceivable.status)}</strong></div>
                  <div className="info-item"><small>Valor líquido</small><strong>{currency(selectedReceivable.netAmount)}</strong></div>
                  <div className="info-item"><small>Recebido</small><strong>{currency(selectedReceivable.paidAmount)}</strong></div>
                  <div className="info-item"><small>Estornado</small><strong>{currency(selectedReceivable.refundedAmount)}</strong></div>
                  <div className="info-item"><small>Saldo em aberto</small><strong>{currency(selectedReceivable.outstandingAmount ?? selectedReceivable.netAmount)}</strong></div>
                  <div className="info-item"><small>Vencimento</small><strong>{dateOnly(selectedReceivable.dueDate)}</strong></div>
                  <div className="info-item"><small>Tratamento/orçamento</small><strong>{text(nested(selectedReceivable, 'treatment').title, 'Não vinculado')}</strong></div>
                  <div className="info-item"><small>Forma de Pagamento</small><strong>{paymentMethodLabel(selectedReceivable.paymentMethod)}</strong></div>
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
            <div className="filters filter-primary">
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
              <input
                className="filter-input"
                placeholder="Buscar paciente ou descrição…"
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.target.value)}
                aria-label="Buscar por paciente ou descrição"
              />
            </div>
            {filtersOpen ? (
              <div className="filters filter-advanced">
                <p className="muted-note">Filtros avançados reservados para critérios adicionais (clínica, período, profissional).</p>
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
                      <th>Saldo</th>
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
                        <td>{currency(item.outstandingAmount ?? item.netAmount)}</td>
                        <td><StatusBadge tone={statusTone(item.effectiveStatus ?? item.status)}>{presentationLabel(item.effectiveStatus ?? item.status)}</StatusBadge></td>
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
          <Modal
            open={ruleOpen}
            title="Nova regra de comissão"
            description="Regras versionadas: desative ou revise sem alterar eventos já gerados."
            onClose={() => setRuleOpen(false)}
          >
            <form className="mutation-form compact" onSubmit={(event) => void createCommissionRule(event)}>
              <label>Base
                <select value={ruleForm.basis} onChange={(event) => setRuleForm((prev) => ({ ...prev, basis: event.target.value }))}>
                  <option value="PRODUCTION">Produção</option>
                  <option value="RECEIPT">Recebimento</option>
                  <option value="PROCEDURE">Procedimento</option>
                </select>
              </label>
              <label>Cálculo
                <select value={ruleForm.calculationType} onChange={(event) => setRuleForm((prev) => ({ ...prev, calculationType: event.target.value }))}>
                  <option value="PERCENTAGE">Percentual</option>
                  <option value="FIXED">Valor fixo</option>
                </select>
              </label>
              <label>Valor
                <input required inputMode="decimal" value={ruleForm.value} onChange={(event) => setRuleForm((prev) => ({ ...prev, value: event.target.value }))} />
              </label>
              <label>Vigência a partir de
                <input type="date" required value={ruleForm.validFrom} onChange={(event) => setRuleForm((prev) => ({ ...prev, validFrom: event.target.value }))} />
              </label>
              <label>Profissional (opcional)
                <select value={ruleForm.professionalId} onChange={(event) => setRuleForm((prev) => ({ ...prev, professionalId: event.target.value }))}>
                  <option value="">Todos</option>
                  {professionals.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>Prioridade
                <input type="number" value={ruleForm.priority} onChange={(event) => setRuleForm((prev) => ({ ...prev, priority: event.target.value }))} />
              </label>
              <button className="button primary" type="submit" disabled={ruleBusy}>{ruleBusy ? 'Salvando…' : 'Criar regra'}</button>
            </form>
          </Modal>
          <Panel
            title="Comissões e repasses"
            description="Métricas, regras versionadas (CommissionRule) e eventos gerados (CommissionEvent)."
            actions={canConfigureCommission ? (
              <button className="button primary small" type="button" onClick={() => setRuleOpen(true)}>Nova regra</button>
            ) : undefined}
          >
            {!canCommission ? (
              <div className="state-message error" role="alert">Sem permissão commission.view_all.</div>
            ) : (
              <div className="commission-layout">
                <section className="stats">
                  <MetricCard label="Regras ativas" value={activeRules.length} meta={`${rules.length} no total`} />
                  <MetricCard
                    label="% média"
                    value={averagePercent == null ? '—' : `${averagePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                    meta="Regras percentuais"
                  />
                  <MetricCard label="Eventos no período" value={commissionEvents.length} meta="Competência atual" />
                </section>

                <div className="dashboard-grid">
                  <Panel title="Competências" description="Feche o mês para liberar repasses">
                    {canCloseCommission ? (
                      <div className="heading-actions" style={{ margin: '0 0 10px' }}>
                        <button className="button small" type="button" onClick={() => void ensureOpenPeriod()}>
                          Garantir mês aberto
                        </button>
                      </div>
                    ) : null}
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
                  </Panel>

                  <Panel title="Regras" description="CRUD via create / deactivate (revise na API)">
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
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rules.map((item) => (
                              <tr key={String(item.id)}>
                                <td>{presentationLabel(item.basis)}</td>
                                <td>{presentationLabel(item.calculationType)}</td>
                                <td>{item.calculationType === 'PERCENTAGE' || String(item.calculationType).includes('PERCENT') ? `${text(item.value)}%` : currency(item.value)}</td>
                                <td>
                                  {dateOnly(item.validFrom)}
                                  {item.validTo || item.validUntil ? ` → ${dateOnly(item.validTo ?? item.validUntil)}` : ' · vigente'}
                                </td>
                                <td className="row-actions">
                                  {canConfigureCommission && item.active !== false ? (
                                    <button className="button small" type="button" disabled={ruleBusy} onClick={() => void deactivateRule(String(item.id))}>
                                      Desativar
                                    </button>
                                  ) : (
                                    <StatusBadge tone="gray">Inativa</StatusBadge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </div>

                <Panel title="Eventos gerados" description="CommissionEvent — nascem de pagamentos confirmados">
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
                </Panel>
              </div>
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
        <>
          <Modal
            open={recurrenceOpen}
            title="Nova recorrência"
            description="Gera contas a pagar ou a receber no vencimento (worker + geração manual)."
            onClose={() => setRecurrenceOpen(false)}
            size="medium"
          >
            {!canFinanceCreate ? (
              <div className="state-message error" role="alert">Sem permissão financial.create.</div>
            ) : (
              <form className="mutation-form compact" onSubmit={(event) => void createRecurrence(event)}>
                <label>
                  Tipo
                  <select
                    value={recurrenceForm.kind}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, kind: event.target.value }))}
                  >
                    <option value="PAYABLE">Conta a pagar</option>
                    <option value="RECEIVABLE">Conta a receber</option>
                  </select>
                </label>
                <label className="span-2">
                  Descrição
                  <input
                    required
                    minLength={3}
                    value={recurrenceForm.description}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label>
                  Valor
                  <input
                    required
                    inputMode="decimal"
                    value={recurrenceForm.amount}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </label>
                <label>
                  Frequência
                  <select
                    value={recurrenceForm.frequency}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, frequency: event.target.value }))}
                  >
                    <option value="DAILY">Diária</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensal</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </label>
                <label>
                  Intervalo
                  <input
                    type="number"
                    min={1}
                    max={36}
                    value={recurrenceForm.interval}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, interval: event.target.value }))}
                  />
                </label>
                <label>
                  Próxima ocorrência
                  <input
                    type="date"
                    required
                    value={recurrenceForm.nextOccurrence}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, nextOccurrence: event.target.value }))}
                  />
                </label>
                <label>
                  Termina em (opcional)
                  <input
                    type="date"
                    value={recurrenceForm.endsAt}
                    onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                  />
                </label>
                {recurrenceForm.kind === 'RECEIVABLE' ? (
                  <label className="span-2">
                    Paciente
                    <select
                      required
                      value={recurrenceForm.patientId}
                      onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, patientId: event.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {patients.map((patient) => (
                        <option key={String(patient.id)} value={String(patient.id)}>
                          {text(patient.fullName)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="span-2">
                    Fornecedor (opcional)
                    <input
                      value={recurrenceForm.supplierName}
                      onChange={(event) => setRecurrenceForm((prev) => ({ ...prev, supplierName: event.target.value }))}
                    />
                  </label>
                )}
                <button className="button primary" type="submit" disabled={recurrenceBusy === 'create'}>
                  {recurrenceBusy === 'create' ? 'Salvando…' : 'Criar recorrência'}
                </button>
              </form>
            )}
          </Modal>
          <Panel
            title="Recorrências"
            description={`${recurrences.length} regras na clínica.`}
            actions={(
              <div className="heading-actions" style={{ marginLeft: 0 }}>
                <button
                  className="button small"
                  type="button"
                  aria-expanded={recurrenceFiltersOpen}
                  onClick={() => setRecurrenceFiltersOpen((value) => !value)}
                >
                  <SlidersHorizontal size={14} />Filtros avançados
                </button>
                {canFinanceCreate ? (
                  <button className="button primary small" type="button" onClick={() => setRecurrenceOpen(true)}>
                    Nova recorrência
                  </button>
                ) : null}
              </div>
            )}
          >
            <div className="filters filter-primary">
              <select
                className="filter-select"
                aria-label="Filtrar por tipo"
                value={recurrenceKindFilter}
                onChange={(event) => setRecurrenceKindFilter(event.target.value)}
              >
                <option value="">Todos os tipos</option>
                <option value="PAYABLE">Conta a pagar</option>
                <option value="RECEIVABLE">Conta a receber</option>
              </select>
            </div>
            {recurrenceFiltersOpen ? (
              <div className="filters filter-advanced">
                <input
                  className="filter-input"
                  placeholder="Buscar descrição…"
                  value={recurrenceQuery}
                  onChange={(event) => setRecurrenceQuery(event.target.value)}
                  aria-label="Buscar recorrência"
                />
              </div>
            ) : null}
            {!canFinance ? (
              <div className="state-message error" role="alert">Sem permissão financial.view.</div>
            ) : filteredRecurrences.length === 0 ? (
              <EmptyState title="Nenhuma recorrência" description={recurrences.length ? 'Nenhum resultado para os filtros.' : 'Cadastre aluguel, assinaturas ou mensalidades periódicas.'} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Frequência</th>
                      <th>Próxima</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecurrences.map((item) => (
                      <tr key={String(item.id)}>
                        <td>{text(item.description)}</td>
                        <td>{presentationLabel(item.kind)}</td>
                        <td>{currency(item.amount)}</td>
                        <td>{presentationLabel(item.frequency)} × {text(item.interval, '1')}</td>
                        <td>{dateOnly(item.nextOccurrence)}</td>
                        <td>
                          <StatusBadge tone={item.active ? 'green' : 'gray'}>
                            {item.active ? 'Ativa' : 'Inativa'}
                          </StatusBadge>
                        </td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="button secondary"
                            disabled={recurrenceBusy === String(item.id) || !canFinanceCreate || !item.active}
                            onClick={() => void generateRecurrence(String(item.id))}
                          >
                            Gerar agora
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={recurrenceBusy === String(item.id) || !canFinanceCreate}
                            onClick={() => void toggleRecurrence(String(item.id), Boolean(item.active))}
                          >
                            {item.active ? 'Pausar' : 'Reativar'}
                          </button>
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
      {tab === 'cashflow' && (
        <Panel title="Fluxo de caixa" description="Entradas, saídas, saldo e série diária do período.">
          {!canFinance ? (
            <div className="state-message error" role="alert">Sem permissão financial.view.</div>
          ) : (
            <>
              <div className="chip-row" role="group" aria-label="Período do fluxo">
                {([
                  ['7d', '7 dias'],
                  ['30d', '30 dias'],
                  ['90d', '90 dias'],
                  ['year', 'Ano'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip ${cashflowPeriod === id ? 'active' : ''}`}
                    onClick={() => setCashflowPeriod(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {loading ? <div className="state-message">Carregando…</div> : null}
              {!loading && !cashflow ? (
                <EmptyState title="Sem dados de fluxo" description="O endpoint /cashflow não retornou agregados para o período." />
              ) : null}
              {cashflow ? (
                <>
                  <section className="stats">
                    <MetricCard label="Entradas" value={currency(cashflow.inflow ?? 0)} meta={`${text(nested(cashflow, 'counts').inflows, '0')} lançamentos`} tone="green" />
                    <MetricCard label="Saídas" value={currency(cashflow.outflow ?? 0)} meta={`${text(nested(cashflow, 'counts').outflows, '0')} lançamentos`} tone="red" />
                    <MetricCard label="Saldo" value={currency(cashflow.net ?? 0)} meta={`${dateOnly(cashflow.from)} → ${dateOnly(cashflow.to)}`} />
                  </section>
                  <div className="dashboard-grid">
                    <Panel title="Entradas por forma" description="Pagamentos confirmados">
                      {list(cashflow.inflowByMethod).length === 0 ? (
                        <EmptyState title="Sem entradas" description="Nenhum recebimento no período." />
                      ) : (
                        <div className="billing-list">
                          {list(cashflow.inflowByMethod).map((row) => (
                            <div className="billing-row" key={String(row.method)}>
                              <div><strong>{paymentMethodLabel(row.method)}</strong><span>{currency(row.amount)}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                    <Panel title="Saídas por forma" description="Pagamentos de contas a pagar">
                      {list(cashflow.outflowByMethod).length === 0 ? (
                        <EmptyState title="Sem saídas" description="Nenhuma saída no período." />
                      ) : (
                        <div className="billing-list">
                          {list(cashflow.outflowByMethod).map((row) => (
                            <div className="billing-row" key={String(row.method)}>
                              <div><strong>{paymentMethodLabel(row.method)}</strong><span>{currency(row.amount)}</span></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>
                  <Panel
                    title="Série diária"
                    description="Entradas, saídas e saldo acumulado por dia do período."
                  >
                    {list(cashflow.series).length === 0 ? (
                      <EmptyState title="Sem série" description="Nenhum dia no intervalo selecionado." />
                    ) : (
                      <div className="table-wrap cashflow-series-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Entradas</th>
                              <th>Saídas</th>
                              <th>Saldo do dia</th>
                              <th>Saldo acumulado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list(cashflow.series).map((row) => {
                              const dayNet = Number(row.net ?? 0);
                              const balance = Number(row.balance ?? 0);
                              const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? ''))
                                ? dateOnly(`${String(row.date)}T12:00:00`)
                                : dateOnly(row.date);
                              return (
                                <tr key={String(row.date)}>
                                  <td>{dateLabel}</td>
                                  <td>{currency(row.inflow ?? 0)}</td>
                                  <td>{currency(row.outflow ?? 0)}</td>
                                  <td style={{ color: dayNet < 0 ? 'var(--danger)' : dayNet > 0 ? 'var(--success)' : undefined }}>
                                    {currency(dayNet)}
                                  </td>
                                  <td style={{ color: balance < 0 ? 'var(--danger)' : undefined }}>
                                    {currency(balance)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                </>
              ) : null}
            </>
          )}
        </Panel>
      )}
    </>
  );
}
